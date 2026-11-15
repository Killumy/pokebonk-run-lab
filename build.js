"use strict";

window.BONK_BUILD=(()=>{
  const d=window.BONK;
  const areas=new Set(["nova","spin","cone","wave","vortex","trap","lob","orbit","aura"]);
  const target=new Set(["strike","bolt","beam","barrage","homing","smite","dash","meteor","drain","boomerang","chain","orb"]);
  const projectiles=new Set(["bolt","barrage","homing","boomerang","orb"]);
  const control=new Set(["freeze","sleep","paralysis","confusion","trap","flinch"]);
  function build(p,goal) {
    const signatures=new Map(d.fusions.filter((f)=>f.member).map((f)=>[f.member,f]));
    const items=new Map(d.items.map((i)=>[i.key,i]));
    const vits=new Map(d.vitamins.map((v)=>[v.key,v]));
    const fusion=signatures.get(p.id);
    const kit=p.league.kit.map((key)=>({key,...d.moves[key]}));
    const score=(m)=>{
      const a=areas.has(m.shape),t=target.has(m.shape),c=control.has(m.status),hit=m.cls!=="status";
      if(goal==="survival") return 3*a+3*c+3*(m.shape==="drain")+hit;
      if(goal==="boss") return 4*t+2*hit;
      return 2*a+2*hit+t+c;
    };
    const damageMoves=kit.filter((m)=>m.cls!=="status");
    const candidates=goal==="boss"&&damageMoves.length ? damageMoves : kit.slice(1);
    const priority=candidates.sort((a,b)=>score(b)-score(a))[0];
    const physical=fusion.cls==="physical";
    const bonus=physical?"choice-band":"choice-specs";
    const vitamin=physical?"protein":"calcium";
    const element=d.typeItems[(goal!=="classic"||fusion.limited)?priority.type:fusion.types[0]] || d.typeItems[fusion.types[0]];
    const aoe=kit.some((m)=>areas.has(m.shape));
    const multiple=kit.filter((m)=>projectiles.has(m.shape)).length>=2;
    const status=kit.some((m)=>["burn","poison"].includes(m.status));
    const evolving=p.league.forms.length>1;
    const equipment=goal==="survival"?["leftovers",evolving?"eviolite":"assault-vest","shell-bell",element,status?"black-sludge":"choice-scarf"]:
      goal==="boss"?[bonus,element,"shell-bell","scope-lens","expert-belt"]:
      [element,"exp-share",bonus,aoe?"wide-lens":"choice-scarf",status?"black-sludge":"shell-bell"];
    const vitamins=goal==="survival"?["iron","carbos",aoe?"super-potion":"zinc",vitamin]:
      goal==="boss"?[vitamin,"ether","carbos",multiple?"pp-up":"dire-hit"]:[vitamin,"ether",multiple?"pp-up":aoe?"stardust":"carbos","iron"];
    let strategy=goal==="survival"?'Dai priorità a '+priority.name+' e tieni una scelta per la difesa. Mobilità e controllo ti aiutano a lasciare un’uscita quando la folla chiude il passaggio.':
      goal==="boss"?'Prova '+priority.name+' contro il bersaglio singolo. Conserva una mossa per liberare spazio e dai priorità ai bonus di danno che si applicano al tuo attacco principale.':
      ('Apri con '+kit[0].name+' e potenzia '+priority.name+' quando compare. '+(fusion.limited?'Cerca una mossa complementare per coprire la distanza o la folla.':'Se la run regge già le ondate, conserva gli ingredienti per '+fusion.name+'.'));
    return {fusion,kit,priority,items:[...new Set(equipment)].map((k)=>items.get(k)).filter(Boolean),vitamins:vitamins.map((k)=>vits.get(k)),strategy};
  }
  const offerLevels=[1,2,4,7];
  return {build,offerLevels};
})();
