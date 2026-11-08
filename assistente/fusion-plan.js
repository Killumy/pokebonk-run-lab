"use strict";

window.BONK_FUSION_PLAN=(()=>{
  const d=window.BONK;
  const {offerLevels}=window.BONK_BUILD;
  const {fold}=window.BONK_ASSIST_STATS;
  const signatures=d.fusions.filter((f)=>f.member);
  const reactions=d.fusions.filter((f)=>f.kind==="reaction");
  const byType=new Map(d.fusions.filter((f)=>f.kind==="type").map((f)=>[f.types[0],f]));
  const glitch=d.fusions.find((f)=>f.kind==="glitch");
  const ingredientLevel=8;
  const samePair=(keys,a,b)=>keys.includes(a)&&keys.includes(b);

  function recipe(a,b){
    const signature=signatures.find((f)=>samePair(f.moves,a.key,b.key));
    if(a.shape==="support"||b.shape==="support") return null;
    return signature??reactions.find(({pair:[left,right]})=>
      (left.includes(a.type)&&right.includes(b.type))||(left.includes(b.type)&&right.includes(a.type))
    )??(a.type===b.type?byType.get(a.type):null)??glitch;
  }

  function target(b,run,moveIndex,signatureUnavailable){
    const learned=new Map();
    for(const slot of run.known){
      if(slot.fused||slot.linked) continue;
      const move=moveIndex.get(fold(slot.names[0]));
      if(move) learned.set(move.key,{move,level:slot.level,unlocked:true});
    }
    const planned=b.kit.map((move,i)=>learned.get(move.key)??{move,level:0,unlocked:run.level>=offerLevels[i]});
    const signaturePair=b.fusion.moves.map((key)=>planned.find((s)=>s.move.key===key));
    const signatureMade=run.known.some((slot)=>slot.fusionKey===b.fusion.key);
    const signatureLinked=run.known.some((slot)=>slot.linked&&slot.names.some((name)=>b.fusion.moves.includes(moveIndex.get(fold(name))?.key)));
    // Bill allows weather and buff moves in the player's own signature recipe.
    const signature=!signatureMade&&!signatureLinked&&!signatureUnavailable&&signaturePair.every(Boolean)
      ? {fusion:b.fusion,pair:signaturePair,signature:true}
      : null;
    const missing=signature?.pair.filter((s)=>!s.level).length??0;

    if(signature&&missing<=run.freeSlots) return signature;
    const candidates=new Map(learned);
    const unavailable=(key)=>signatureUnavailable&&b.fusion.moves.includes(key)&&!learned.has(key);
    for(const s of planned){
      if(s.unlocked&&!candidates.has(s.move.key)&&!unavailable(s.move.key)) candidates.set(s.move.key,s);
    }
    for(const card of run.offers){
      if(card.kind!=="level"||!card.learn) continue;
      const move=moveIndex.get(fold(card.name));
      if(move&&!candidates.has(move.key)&&!unavailable(move.key)) candidates.set(move.key,{move,level:0,unlocked:true});
    }

    const moves=[...candidates.values()];
    const bill=run.offers.some((card)=>card.kind==="bill-exit");
    const readyRows=run.offers.filter((card)=>card.kind==="fusion"&&card.ready);
    const alternatives=[];
    for(let i=0;i<moves.length;i++){
      for(const other of moves.slice(i+1)){
        const pair=[moves[i],other];
        if(!pair.some((s)=>s.level)||pair.filter((s)=>!s.level).length>run.freeSlots) continue;
        if(pair.every((s)=>s.move.cls==="status")) continue;
        const fusion=recipe(...pair.map((s)=>s.move));
        if(!fusion||fusion===b.fusion) continue;
        const ready=pair.every((s)=>s.level>=ingredientLevel);
        if(ready&&bill&&!readyRows.some((card)=>card.fusionKey===fusion.key&&
          (!card.ingredients.length||pair.every((s)=>card.ingredients.includes(s.move.key))))) continue;
        const cost=pair.reduce((sum,s)=>sum+Math.max(0,ingredientLevel-s.level),0);
        const grade=fusion.member?5:fusion.kind==="reaction"?3:fusion.kind==="type"?2:0;
        // MissingNo. is a last resort with two moves already at the required level.
        if(!grade&&!ready) continue;
        const classFit=pair.filter((s)=>s.move.cls===b.fusion.cls).length;
        alternatives.push({fusion,pair,ready,score:grade+classFit*.6-cost*.6});
      }
    }
    alternatives.sort((a,b)=>b.score-a.score);
    if(signature){
      const late=run.stage>=3;
      return (late&&alternatives.find((a)=>a.ready))||signature;
    }
    return alternatives[0]??null;
  }

  return {target,ingredientLevel};
})();
