"use strict";

(()=>{
  const d=window.BONK;
  const {build}=window.BONK_BUILD;
  const {target:fusionTarget,ingredientLevel}=window.BONK_FUSION_PLAN;
  const aliases=window.BONK_ASSIST_ALIASES;
  const stats=window.BONK_ASSIST_STATS;
  const {fold}=stats;
  const moveIndex=new Map();
  for(const [key,move] of Object.entries(d.moves)){
    const entry={key,...move};
    moveIndex.set(fold(move.name),entry);
    if(aliases.moves[key]) moveIndex.set(fold(aliases.moves[key]),entry);
  }
  const fusionIndex=new Map();
  for(const fusion of d.fusions){
    fusionIndex.set(fold(fusion.name),fusion);
    if(aliases.fusions[fusion.key]) fusionIndex.set(fold(aliases.fusions[fusion.key]),fusion);
  }
  const typeByItem=new Map(Object.entries(d.typeItems).map(([type,key])=>[key,type]));
  const pokemon=new Map(d.pokemon.map((p)=>[p.id,p]));
  const pokemonByName=new Map(d.pokemon.map((p)=>[fold(p.name),p]));
  const modes={classic:"Classic",survival:"Survival",boss:"Boss"};
  const rarities=["Comune","Non comune","Raro","Epico","Leggendario"];
  const rarityLabels=[
    ["common","comun"],["uncommon","poco comun"],["rare","raro","rara"],
    ["epic","epico","epica"],["legendary","legendario","legendaria"]
  ];
  const rarityBonus=[0,4,11,23,48];
  const matches=(name,key,english,group)=>[english,aliases[group][key]].some((n)=>n && fold(n)===fold(name));
  const label=(entry,group)=>document.documentElement.lang.startsWith("es") ? aliases[group][entry.key]||entry.name : entry.name;
  const text=(root,selector)=>root.querySelector(selector)?.textContent.trim()??"";
  const readRarity=(el,selector=".top .rar")=>{
    const name=fold(text(el,selector));
    const rank=rarityLabels.findIndex((labels)=>labels.includes(name));
    return rank<0?undefined:rank;
  };
  const shown=(el)=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=="hidden";
  let hud=null;
  let partner=null;
  let panel=null;
  let mode="classic";
  let folded=false;
  let previous="";
  let lastLevel=0;
  let signatureUnavailable=false;
  let plan=null;
  let framed=null;
  let frame=null;

  function create(tag,value,cls){
    const node=document.createElement(tag);
    if(value) node.textContent=value;
    if(cls) node.className=cls;
    return node;
  }
  function mount(){
    panel=create("aside");
    panel.id="pbrl-assistant";
    panel.setAttribute("aria-label","Assistente PokeBonk Run Lab");
    for(const type of ["pointerdown","mousedown","mouseup","click","keydown"]){
      panel.addEventListener(type,(e)=>e.stopPropagation());
    }
    attach();
  }
  function attach(){
    const fullscreen=document.fullscreenElement;
    const parent=fullscreen && !["CANVAS","VIDEO","IFRAME"].includes(fullscreen.tagName) ? fullscreen : document.body;
    if(panel.parentElement!==parent) parent.append(panel);
  }
  function iconKey(slot){
    const src=slot.querySelector('img[src*="/items/"]')?.getAttribute("src")??"";
    return src.match(/\/items\/([^/?#]+)\.png/i)?.[1]??"";
  }
  function gearSlot(rows,entry,group){
    return rows.find((slot)=>{
      const name=slot.getAttribute("title")?.split(": ")[0];
      if(name&&matches(name,entry.key,entry.name,group)) return true;
      const icon=group==="vitamins" ? aliases.vitIcons[entry.key]||entry.key : entry.key;
      return iconKey(slot)===icon;
    });
  }
  function highlight(element){
    if(framed===element && (!element||frame?.parentElement===element)) return;
    frame?.remove();
    framed?.classList.remove("pbrl-frame-host");
    framed=element;
    if(!element) return;
    if(getComputedStyle(element).position==="static") element.classList.add("pbrl-frame-host");
    frame=create("span","","pbrl-choice-frame");
    frame.setAttribute("aria-hidden","true");
    element.append(frame);
  }

  function readCount(value){
    const match=value.trim().match(/^([\d.,\s]+)\s*(mil|[kmb])?(?=\s|$)/i);
    if(!match) return 0;
    const unit={mil:1e3,k:1e3,m:1e6,b:1e9}[match[2]?.toLowerCase()];
    if(!unit) return Number(match[1].replace(/[^\d]/g,""))||0;
    return (Number(match[1].trim().replace(",","."))||0)*unit;
  }

  function readOffers(){
    const modal=[...document.querySelectorAll(".modal")].findLast(shown);
    if(!modal||modal.querySelector(".cards.banning")) return [];
    const buttons=(root,selector)=>[...root.querySelectorAll(selector)].filter((el)=>!el.disabled&&shown(el));
    const hotkey=(el,selector)=>text(el,selector).match(/^\[?(\d)\]?$/)?.[1]??"";
    const levelUp=buttons(modal,"button.card.offer");
    if(levelUp.length){
      const actions=buttons(modal,":scope > .actions > button");
      const lesson=modal.classList.contains("hy-modal");
      const reroll=actions.find((el)=>/^(refresh|reroll|refrescar|renovar)\s*\([1-9]\d*\)/.test(fold(el.textContent.trim())));
      const skip=actions.find((el)=>/^(skip|saltar)\s*\([1-9]\d*\)/.test(fold(el.textContent.trim())))
        ??(lesson?actions.find((el)=>el.classList.contains("ghost")):null);
      const offers=levelUp.map((el)=>{
        const subtitle=text(el,".bd > .sub");
        return {
          kind:"level",element:el,name:text(el,".bd h3"),hotkey:hotkey(el,".key"),rarity:readRarity(el),
          learn:/^(new movement|new move|nuevo movimiento)$/.test(fold(subtitle))||/^(movement|movimiento)$/.test(fold(text(el,".top .rar"))),
          stars:subtitle.match(/★\s*(\d+)\s*→\s*★\s*(\d+)\s*\([^★]*★\s*(\d+)/)?.slice(1).map(Number)??[],
          lesson
        };
      });
      if(reroll) offers.push({kind:"reroll",element:reroll,name:"Refresh",hotkey:text(reroll,"kbd:not([data-nokbd])")});
      if(skip) offers.push({kind:"skip",element:skip,name:lesson?"Salva la lezione":"Salta",hotkey:text(skip,"kbd:not([data-nokbd])"),lesson});
      return offers;
    }

    const blessings=buttons(modal,".cards > button.card").filter((el)=>el.querySelector('img[src*="/ui/icons/blessing.png"]'));
    if(blessings.length) return blessings.map((el)=>({
      kind:"blessing",element:el,name:text(el,".bd h3"),hotkey:hotkey(el,".key"),rarity:readRarity(el)
    }));

    const dojo=buttons(modal,".dj-grid > button.dj-stat");
    if(dojo.length) return dojo.map((el)=>{
      const start=el.classList.contains("on")?buttons(modal,"button.dj-go")[0]:null;
      return {kind:"blessing",element:start||el,name:text(el,"span"),start:!!start,rarity:readRarity(modal,".dj-rar")};
    });

    const relics=buttons(modal,".rl-cards > button.rl-card");
    if(relics.length){
      const incoming=text(modal,".rl-incoming .rl-stats");
      const owned=[...modal.querySelectorAll(".rl-mine .rl-chip-bd > span")].map((el)=>el.textContent.trim());
      return relics.map((el)=>({
        kind:"relic",element:el,name:text(el,".rl-bd h3"),hotkey:hotkey(el,".rl-key"),
        modifiers:text(el,".rl-stats"),incoming,owned,rarity:readRarity(el,".rl-rar")
      }));
    }

    const bill=modal.querySelector(".bm-win");
    if(bill){
      const rows=[...bill.querySelectorAll("button.bm-row")].filter(shown);
      const offers=rows.map((el)=>{
        const ready=!el.disabled&&!el.classList.contains("off");
        const selected=ready&&el.classList.contains("sel");
        const confirm=selected?buttons(bill,"button.bm-go.fuse")[0]:null;
        const fuseTab=selected&&!confirm?buttons(bill,".bm-tabs > button.bm-tab:first-child")[0]:null;
        const ingredients=[...(el.querySelector(".bm-pair")?.children??[])].map((node)=>moveIndex.get(fold(node.textContent.trim()))?.key).filter(Boolean);
        const name=text(el,".bm-rtx b");
        return {
          kind:"fusion",element:confirm||fuseTab||el,name,fusionKey:fusionIndex.get(fold(name))?.key,
          hotkey:confirm?text(confirm,"kbd"):fuseTab?"":hotkey(el,".bm-key"),
          confirm:!!confirm,ready,ingredients,needs:fold(text(el,".bm-need"))
        };
      });
      const close=buttons(bill,".bm-actions > button.btn.ghost")[0];
      if(close) offers.push({kind:"bill-exit",element:close,name:"Torna da Bill più tardi",hotkey:text(close,"kbd")});
      return offers;
    }

    const hypno=modal.querySelector(".hy-panel");
    if(hypno){
      const attacks=hypno.querySelector(".hy-list");
      const offers=attacks?[...attacks.querySelectorAll(".hy-row")].filter((row)=>!row.querySelector(".hy-mem.warn")).flatMap((row)=>{
        const button=buttons(row,"button.btn.red")[0];
        const name=text(row,"h4").split(" · ")[0];
        const damage=Number(text(row,".hy-share span").match(/\d+/)?.[0])||0;
        return button&&name?[{kind:"forget",element:button,name,damage}]:[];
      }):[];
      const learn=buttons(hypno,".hy-lesson.ready button.btn.purple")[0];
      const close=buttons(modal,"button.shop-exit")[0];
      if(learn) offers.push({kind:"lesson",element:learn,name:"Chiedi la lezione a Hypno"});
      if(close) offers.push({kind:"hypno-exit",element:close,name:"Torna alla run"});
      return offers;
    }

    const releaseKeys=["release","liberar","release the new one","liberar al nuevo"];
    const recruits=buttons(modal,".cards > button.card").filter((el)=>releaseKeys.includes(fold(text(el,".bd > .key"))));
    if(recruits.length){
      return recruits.map((el)=>{
        const key=fold(text(el,".bd > .key"));
        const name=text(el,".bd h3");
        const moveName=text(el,".bd > p:nth-of-type(2)").match(/^[^:]+:\s*(.*?)\s*\(/)?.[1];
        const move=moveIndex.get(fold(moveName));
        const [kills=0,damage=0]=text(el,".bd > .sub").split(" · ").map(readCount);
        return {
          kind:"companion",element:el,name,hotkey:"",incoming:key===releaseKeys[2]||key===releaseKeys[3],
          bond:Number(text(el,".top .rar").match(/\d+/)?.[0])||0,kills,damage,
          type:move?.type??pokemonByName.get(fold(name))?.types[0],control:move?.status,
          passive:stats.parse(text(el,".bd > p:first-of-type"))
        };
      });
    }

    const shop=modal.classList.contains("shop-modal");
    const saleButton=buttons(modal,":scope > .actions > button.btn.ghost").find((el)=>/\+\s*[\d.,\s]+₽/.test(el.textContent));
    const sale=saleButton?{
      element:saleButton,
      hotkey:text(saleButton,"kbd"),
      payout:saleButton.textContent.match(/\+\s*[\d.,\s]+₽/)?.[0]
    }:null;
    const itemOffer=(card,element,key,countLimit)=>({
      kind:"item",element,name:text(card,".bd h3"),itemKey:iconKey(card),hotkey:key,
      rarity:readRarity(card),countLimit,sale,affectsNone:!!card.querySelector(".affects.none")
    });
    const itemCards=buttons(modal,".cards > button.card:not(.pact)").filter((el)=>
      iconKey(el) && Number(el.style.opacity||1)>=1 && (!shop||el.querySelector(".price.ok"))
    );
    if(itemCards.length) return itemCards.map((el)=>itemOffer(el,el,hotkey(el,".key"),text(el,".cap")));

    const single=modal.querySelector(":scope > div.card");
    const take=buttons(modal,":scope > .actions > button.btn.green.big")[0];
    return single&&iconKey(single)&&(take||sale)
      ? [itemOffer(single,take,take?text(take,"kbd:not([data-nokbd])"):"",text(modal,":scope > .help"))] : [];
  }

  function readRun(root){
    const moveSlots=[...root.querySelectorAll(".hud-bl .bl-row > .slots > .slot")];
    const known=moveSlots.map((slot)=>{
      const displayLevel=text(slot,".lvl");
      const name=text(slot,".nm");
      const fused=slot.classList.contains("fused");
      const linked=slot.classList.contains("linked");
      const maxed=/^m[aá]x\.?$/i.test(displayLevel);
      return {
        names:name.split(" + ").filter(Boolean),displayLevel,fused,linked,maxed,
        level:maxed&&!fused?ingredientLevel:Number(displayLevel.replace(/^★\s*/,""))||0,
        fusionKey:fused?fusionIndex.get(fold(name))?.key:undefined
      };
    });
    const level=Number(text(root,".tl-lvl b"))||1;
    const stage=Number(text(root,".ht-zone").match(/(\d+)\s*\//)?.[1])||1;
    const health=root.querySelector(".hpbar.low")?"low":root.querySelector(".hpbar.mid")?"mid":"normal";
    return {
      level, stage, health, known, offers:readOffers().filter((offer)=>offer.name),
      freeSlots:moveSlots.filter((slot)=>slot.classList.contains("empty")).length,
      items:[...root.querySelectorAll(".hud-br > .itm")],
      vitamins:[...root.querySelectorAll(".hud-bl > .slots > .slot.mini:not(.empty)")]
    };
  }

  function itemScore(item,types,values,run){
    const type=typeByItem.get(item.key);
    if(type) return types.has(type)?1.8:.25;
    // A few conditional effects are expressed in prose in the catalogue.
    const utility={
      "expert-belt":types.size?values.superEffective*2:0,
      "shell-bell":values.lifesteal*.8,
      "leftovers":values.regen*1.7,
      "focus-band":values.armor*.9,
      "focus-sash":values.armor*1.8,
      revive:values.armor*1.8,
      "max-revive":values.armor*2.6,
      "rainbow-wing":values.armor*2.6,
      "guard-spec":values.armor*1.8,
      "rage-candy-bar":(mode==="survival"||run.health==="low") ? .2 : 1.5,
      "binding-band":values.statusChance>.5?1.35:.2,
      "fire-stone":values.statusDamage>0?2:.1,
      "water-stone":types.has("water")?2:.1,
      "ice-stone":types.has("ice")?2:.4,
      "thick-club":values.physical*1.6,
      "dowsing-machine":run.stage<3?1.6:0,
      "rare-candy":.65+values.xp,
      "tm-case":1.8
    }[item.key];
    if(utility!==undefined) return utility;
    const modifiers=item.effect.split(/\.\s/)[0].split(/\s+(?:and|e|but)\s+|,\s+(?=[+−-])/);
    // Read the whole clause so a negative stat is counted alongside the gain.
    const parsed=modifiers.map(stats.parse);
    return parsed.every(Boolean)?parsed.reduce((sum,mod)=>sum+stats.score(mod,values),0):null;
  }

  function companionChoice(offers,types,values){
    const newcomers=offers.filter((card)=>card.incoming);
    const team=offers.filter((card)=>!card.incoming);
    if(newcomers.length!==1||!team.length) return null;
    const [newcomer]=newcomers;
    const maxDamage=Math.max(1,...team.map((card)=>card.damage));
    const maxKills=Math.max(1,...team.map((card)=>card.kills));
    const score=(card,coverage)=>{
      const addsCoverage=card.type&&!coverage.has(card.type);
      const support=stats.score(card.passive,values);
      const control=card.control&&card.control!=="burn"&&card.control!=="poison";
      return support+(addsCoverage ? .65 : 0)+(control ? .25 : 0)+card.bond*.22
        +.85*card.damage/maxDamage+.45*card.kills/maxKills;
    };
    const swaps=team.map((card)=>{
      const coverage=new Set([...types,...team.filter((other)=>other!==card).map((other)=>other.type)]);
      return {card,gain:score(newcomer,coverage)-score(card,coverage)};
    }).sort((a,b)=>b.gain-a.gain);
    const best=swaps[0];
    if(best.gain>=.45) return {
      card:best.card,title:"Libera "+best.card.name+" per "+newcomer.name,
      why:"Il nuovo compagno offre più copertura o supporto per la tua build."
    };
    return {
      card:newcomer,title:"Lascia andare "+newcomer.name,
      why:"La squadra attuale offre più valore considerando bonus, legame e contributo in partita."
    };
  }

  function suggest(b,run){
    if(run.offers.some((card)=>card.kind==="fusion"&&
      matches(card.name,b.fusion.key,b.fusion.name,"fusions")&&/desterrad|banished|already inside|already part of|dentro de otra fusion/.test(card.needs))){
      signatureUnavailable=true;
    }
    const objective=fusionTarget(b,run,moveIndex,signatureUnavailable);
    const pair=objective?.pair??[];
    const reserved=pair.filter((s)=>!s.level).length;
    const blocked=reserved>run.freeSlots;
    const ready=pair.length===2&&pair.every((s)=>s.level>=ingredientLevel);
    const missingItems=b.items.filter((x)=>!gearSlot(run.items,x,"items"));
    const missingVits=b.vitamins.filter((x)=>!gearSlot(run.vitamins,x,"vitamins"));
    const active=run.known.flatMap((slot)=>slot.names.map((name)=>moveIndex.get(fold(name))).filter(Boolean));
    const types=new Set([...active,...b.kit].filter((move)=>move.cls!=="status").map((move)=>move.type));
    const fused=run.known.filter((slot)=>slot.fused);
    const upgrades=fused.filter((slot)=>!slot.maxed);
    const unfinished=upgrades.find((slot)=>slot.fusionKey===b.fusion.key)??upgrades[0];
    const tmCase=gearSlot(run.items,d.items.find((item)=>item.key==="tm-case"),"items");
    const cap=tmCase?6:5;
    const progress=unfinished&&{name:unfinished.names[0],stars:unfinished.level,max:cap};
    const targetAvailable=!!unfinished||pair.some((s)=>s.level>0?s.level<ingredientLevel:s.unlocked&&run.freeSlots>0);
    const forget=blocked?run.offers.filter((card)=>card.kind==="forget"&&!pair.some((s)=>matches(card.name,s.move.key,s.move.name,"moves")))
      .sort((a,b)=>a.damage-b.damage)[0]:null;
    const values=stats.weights(b,run,mode,active);
    const companion=companionChoice(run.offers.filter((card)=>card.kind==="companion"),types,values);
    const statTotal=(value)=>{
      const mods=value.split(" · ").map(stats.parse);
      return mods.every(Boolean)?mods.reduce((sum,mod)=>sum+stats.score(mod,values),0):null;
    };
    const early=run.level<5 && run.known.filter((s)=>s.names.length).length<=1;
    const cards=run.offers.map((card)=>{
      if(card.kind==="reroll"||card.kind==="skip") return {...card,score:0};
      if(card.kind==="bill-exit"){
        const why=blocked?"Libera uno slot da Hypno e recupera gli ingredienti."
          :objective?"Completa gli ingredienti della fusione prevista prima di usare questa macchina."
          :"Torna con due mosse compatibili al livello 8.";
        return {...card,score:1,why};
      }
      if(card.kind==="forget"){
        return {...card,score:card===forget?100:0,title:"Dimentica "+card.name,why:"Libera spazio per un ingrediente, conservando le mosse della fusione e quelle che fanno più danno."};
      }
      if(card.kind==="lesson") return {...card,score:pair.some((s)=>s.unlocked&&!s.level)?100:0,why:"Cerca un ingrediente della fusione nello slot libero."};
      if(card.kind==="hypno-exit") return {...card,score:1,why:"Conserva le mosse già utili alla tua build."};
      if(card.kind==="companion"){
        return card===companion?.card
          ? {...card,score:1,title:companion.title,why:companion.why}
          : {...card,score:0};
      }
      if(card.kind==="blessing"){
        const bonus=stats.parse(card.name);
        const score=stats.score(bonus,values);
        return {...card,score,why:score>0?(card.start?"Bonus selezionato. Avvia la prova.":stats.explain(bonus,run)):""};
      }
      if(card.kind==="relic"){
        const current=statTotal(card.modifiers);
        const incoming=statTotal(card.incoming);
        const owned=card.owned.map(statTotal);
        const score=current===null?0:card.incoming
          ? incoming!==null&&incoming-current>=.5?incoming-current:0
          : owned.length===3&&owned.every((value)=>value!==null)?current-Math.min(...owned):current;
        return {...card,score,why:card.incoming?"Sostituzione consigliata in base alle statistiche.":"Statistiche adatte al tuo kit. Controlla anche la passiva."};
      }
      if(card.kind==="item"){
        const item=d.items.find((x)=>x.key===card.itemKey)??d.items.find((x)=>matches(card.name,x.key,x.name,"items"));
        const index=b.items.indexOf(item);
        const slot=item&&gearSlot(run.items,item,"items");
        const counts=(card.countLimit??"").match(/\d+/g)?.map(Number)??[];
        const owned=counts.length===2?counts[0]:slot?(Number(text(slot,"b"))||1):0;
        const limit=counts.at(-1)??item?.max??10;
        const rarity=card.rarity??item?.rarity;
        const bonus=rarityBonus[rarity]??0;
        const utility=item?itemScore(item,types,values,run):null;
        const planned=index>=0&&owned===0;
        const useful=utility===null?(card.affectsNone?0:rarity>=2 ? .85 : .45):utility;
        const score=planned?60-index:Math.min(38,useful*12);
        // Sale is a fallback for capped items or bonuses too small to justify keeping.
        const keep=card.element&&owned<limit&&(planned||useful>=.6-bonus/200);
        const why=planned?"Oggetto previsto dalla tua build."
          :item?.key==="expert-belt"?"Aumenta del 30% il danno dei colpi superefficaci."
          :utility===null?"Effetto situazionale. La rarità aumenta la priorità."
          :"Bonus utile per la tua build o per questa fase della run.";
        const sellWhy=owned>=limit?"Hai raggiunto il limite di copie."
          :!card.element?"Il pulsante per tenerlo è indisponibile."
          :utility===null?"Bonus situazionale, con priorità bassa per la tua build."
          :"Il bonus incide poco sulla tua build in questa fase.";
        return {...card,rarity,score:keep?score+bonus:0,why,sellWhy};
      }
      if(card.kind==="fusion"){
        const sameRecipe=objective&&matches(card.name,objective.fusion.key,objective.fusion.name,"fusions");
        const sameIngredients=objective&&card.ingredients.length===2&&objective.pair.every((s)=>card.ingredients.includes(s.move.key));
        const preferred=card.ready&&sameRecipe&&(objective.signature||sameIngredients||!card.ingredients.length);
        return {...card,score:preferred?100:0,title:card.confirm?"Fondi "+card.name:card.name,
          why:card.confirm?"Conferma la fusione. Poi portala al massimo delle stelle."
            :card.element.classList.contains("bm-tab")?"Scegli la scheda Fusione per ottenere la nuova mossa."
            :"Seleziona questa coppia e scegli Fusione."};
      }

      const owned=run.known.find((slot)=>slot.names.some((name)=>fold(name)===fold(card.name)));
      const [stars,nextStars,maxStars]=card.stars;
      if(nextStars||(owned?.fused&&!owned.maxed)){
        const level=stars??owned.level;
        const max=maxStars??cap;
        return {...card,score:170+(owned?.fusionKey===b.fusion.key?8:0)-level,progress:true,title:"Potenzia "+card.name,
          why:"Fusione ★"+level+" → ★"+(nextStars??level+1)+" · obiettivo ★"+max+"."};
      }

      const ingredient=pair.find((s)=>matches(card.name,s.move.key,s.move.name,"moves"));
      if(ingredient&&ingredient.level<ingredientLevel&&(ingredient.level>0||run.freeSlots)){
        const next=ingredient.level+1;
        const name=label(objective.fusion,"fusions");
        return {...card,score:(objective.signature?125:103)+(ingredient.level===0?9:ingredient.level),progress:true,
          why:(ingredient.level===0?"Impara la mossa":"Porta la mossa al livello "+next+"/"+ingredientLevel)+" per "+name+"."};
      }

      const vitamin=d.vitamins.find((x)=>matches(card.name,x.key,x.name,"vitamins"));
      if(vitamin){
        const index=b.vitamins.indexOf(vitamin);
        const utility=stats.score(stats.parse(vitamin.effect.split(" per livello comune")[0]),values);
        return {...card,score:index>=0?44-index:Math.max(9,Math.min(38,utility*23)),rarityEligible:index>=0||utility>0,
          why:index>=0?"Vitamina utile alla build. Mantieni liberi gli slot per gli ingredienti."
            :"Bonus di ripiego. Conserva gli slot delle mosse per la fusione."};
      }

      const move=moveIndex.get(fold(card.name));
      if(owned&&!owned.maxed&&!owned.linked&&!card.learn){
        const preferred=move?.key===b.priority.key||early;
        return {...card,score:preferred?62:move?.cls==="status"?38:50,rarityEligible:true,
          why:preferred?"Più forza subito per arrivare alla fusione.":"Potenzia una mossa già in uso senza occupare altri slot."};
      }
      const fits=move&&move.cls!=="status"&&types.has(move.type);
      const canFill=run.freeSlots>reserved;
      return {...card,score:canFill&&fits?33:card.learn?2:8,rarityEligible:canFill&&fits,
        why:canFill&&fits?"Aggiunge danno e lascia spazio agli ingredienti della fusione."
          :card.learn?"Le risorse per cambiare le offerte sono esaurite. Se serve spazio, recupera lo slot da Hypno."
          :"Potenziamento di ripiego in attesa della prossima offerta."};
    }).map((card)=>card.kind==="level"&&(card.progress||card.rarityEligible)
      ? {...card,score:card.score+(card.progress?Math.min(12,rarityBonus[card.rarity]??0):rarityBonus[card.rarity]??0)}:card
    ).sort((a,b)=>b.score-a.score);

    const nextIngredient=pair.find((s)=>!s.level&&s.unlocked&&run.freeSlots>0)??pair.find((s)=>s.level>0&&s.level<ingredientLevel);
    const caption=unfinished?"Potenzia la fusione":ready?"Fusione pronta":objective?"Prepara la fusione":fused.length?"Fusione al massimo":"Costruisci il kit";
    const best=cards[0];
    const reroll=cards.find((card)=>card.kind==="reroll");
    const skip=cards.find((card)=>card.kind==="skip");
    const sale=best?.sale;
    let choice=best?.score>0?best:null;
    if(best?.kind==="level"&&!best.progress){
      if(reroll&&targetAvailable&&best.score<72&&(!early||best.score<30)){
        choice={...reroll,why:unfinished?"Cerca una carta che alzi le stelle della fusione."
          :"Cerca una carta per gli ingredienti della fusione."};
      } else if(skip&&(skip.lesson||best.score<30)){
        choice={...skip,why:skip.lesson?"Conserva la lezione per una mossa utile alla fusione."
          :"Conserva lo slot e riprova al prossimo livello."};
      }
    } else if(!choice&&sale){
      choice={...best,...sale,action:"sell",why:cards.length===1?best.sellWhy:"Nessun bonus offerto ha abbastanza valore per questa build."};
    }
    let title,why;
    if(choice){
      title=choice.action==="sell"
        ? (cards.length===1?"Vendi "+choice.name:"Prendi i Pokédollari")
        : choice.title??(sale?"Tieni ":"")+choice.name;
      if(choice.action==="sell"&&choice.payout) title+=" · "+choice.payout;
      why=choice.why;
    } else if(cards.length){
      title="Cerca un’offerta utile";
      why="Questa schermata richiede una valutazione a parte.";
    } else if(unfinished){
      title="Potenzia "+unfinished.names[0];
      why="Ora ★"+unfinished.level+" · obiettivo ★"+cap+". Prendi la prossima carta di potenziamento della fusione.";
    } else if(ready){
      title="Fondi "+label(objective.fusion,"fusions");
      why="Gli ingredienti sono al livello 8. Cerca una Macchina di Bill disponibile.";
    } else if(blocked&&run.freeSlots===0){
      title="Libera uno slot da Hypno";
      why="Fai spazio per "+pair.filter((s)=>!s.level).map((s)=>label(s.move,"moves")).join(" e ")+". Conserva gli ingredienti già appresi.";
    } else if(nextIngredient){
      title=(nextIngredient.level>0?"Potenzia ":"Cerca ")+label(nextIngredient.move,"moves");
      why="Porta entrambi gli ingredienti al livello 8 per "+label(objective.fusion,"fusions")+".";
    } else if(objective){
      title="Prepara "+label(objective.fusion,"fusions");
      why=blocked?"Tieni libero lo slot rimasto. Se serve altro spazio, cerca Hypno."
        :"Conserva gli slot necessari per imparare gli ingredienti quando compaiono.";
    } else {
      title="Completa il kit";
      why="Cerca danno, copertura e bonus utili alle mosse che stai usando.";
    }
    return {
      choice,caption,title,why,rarity:cards.length>1&&choice?.action==="sell"?null:rarities[choice?.rarity],
      fusionName:objective?label(objective.fusion,"fusions"):null,pair,progress,missingItems,missingVits
    };
  }

  function render(p,run,result,hotkey,recommended){
    const top=create("div","","pbrl-top");
    top.append(create("span","RUN LAB","pbrl-kicker"),create("strong",p.name+" · Lv. "+run.level));
    const toggle=create("button",folded?"Mostra":"Riduci");
    toggle.type="button";
    toggle.setAttribute("aria-expanded",String(!folded));
    toggle.addEventListener("click",()=>{folded=!folded;refresh();});
    top.append(toggle);
    panel.replaceChildren(top);
    if(folded) return;

    const select=create("select");
    select.setAttribute("aria-label","Obiettivo della build");
    for(const [key,name] of Object.entries(modes)){
      const option=create("option",name);
      option.value=key;
      select.append(option);
    }
    select.value=mode;
    select.addEventListener("change",()=>{mode=select.value;plan=build(partner,mode);refresh();});
    const objective=create("label","","pbrl-mode");
    objective.append(create("span","Obiettivo"),select);
    panel.append(objective);
    const advice=create("div","","pbrl-advice");
    advice.classList.toggle("pbrl-has-choice",recommended);
    const pick=create("div","","pbrl-pick");
    if(hotkey) pick.append(create("span",hotkey,"pbrl-hotkey"));
    pick.append(create("strong",result.title));
    advice.append(create("span",recommended?"Consigliato ora"+(result.rarity?" · "+result.rarity:""):run.offers.length?"Offerte in gioco":result.caption,"pbrl-kicker"),pick,create("small",result.why));
    panel.append(advice);
    const info=create("div","","pbrl-info");
    const equipped=run.known.filter((s)=>s.names.length).map((s)=>s.names.join(" + ")+" "+s.displayLevel).join(" · ");
    if(equipped) info.append(create("small","In uso · "+equipped,"pbrl-gear"));
    if(result.progress){
      const {name,stars,max}=result.progress;
      info.append(create("small",name+" · ★"+stars+" / ★"+max,"pbrl-gear pbrl-fusion-progress"));
    }
    if(result.pair.length){
      const row=create("div","","pbrl-pair");
      row.append(create("span","Obiettivo · "+result.fusionName,"pbrl-kicker"));
      for(const s of result.pair){
        const ingredient=create("div","","pbrl-ingredient"+(s.level>=ingredientLevel?" pbrl-ready":""));
        ingredient.append(create("span",label(s.move,"moves")),create("b",s.level?Math.min(s.level,ingredientLevel)+"/"+ingredientLevel:"—"));
        row.append(ingredient);
      }
      info.append(row);
    }
    if(result.missingItems.length){
      const gear=result.missingItems.slice(0,2).map((x)=>label(x,"items")).join(" · ");
      info.append(create("small","Oggetti da cercare · "+gear,"pbrl-gear"));
    }
    if(result.missingVits.length){
      info.append(create("small","Vitamina da cercare · "+label(result.missingVits[0],"vitamins"),"pbrl-gear"));
    }
    panel.append(info);
  }

  function refresh(){
    const root=document.getElementById("hud");
    const species=Number(root?.querySelector(".tl-portrait[data-k]")?.getAttribute("data-k"));
    const form=pokemon.get(species);
    if(!root||!form||!shown(root)){
      highlight(null);
      if(panel) panel.hidden=true;
      if(!root){hud=null;partner=null;previous="";}
      return;
    }
    const run=readRun(root);
    if(root!==hud||form.partner!==partner?.id||run.level<lastLevel){
      hud=root;
      signatureUnavailable=false;
      partner=pokemon.get(form.partner);
      folded=false;
      previous="";
      plan=partner?.league ? build(partner,mode) : null;
    }
    lastLevel=run.level;
    if(!plan){
      highlight(null);
      if(panel) panel.hidden=true;
      return;
    }
    if(!panel) mount();
    if(panel.hidden) panel.hidden=false;
    attach();
    const {choice,...result}=suggest(plan,run);
    highlight(choice?.element??null);
    panel.classList.toggle("pbrl-picking",!!run.offers.length);
    const stamp=JSON.stringify([species,run.level,mode,folded,run.known,run.offers.length,choice?.hotkey,!!choice,result]);
    if(stamp!==previous){
      previous=stamp;
      render(form,run,result,choice?.hotkey,!!choice);
    }
  }

  setInterval(refresh,300);
  document.addEventListener("fullscreenchange",refresh);
  refresh();
})();
