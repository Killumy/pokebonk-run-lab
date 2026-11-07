"use strict";

(()=>{
  const d=window.BONK;
  const {build,offerLevels}=window.BONK_BUILD;
  const aliases=window.BONK_ASSIST_ALIASES;
  const stats=window.BONK_ASSIST_STATS;
  const {fold}=stats;
  const moveIndex=new Map();
  for(const [key,move] of Object.entries(d.moves)){
    const entry={key,...move};
    moveIndex.set(fold(move.name),entry);
    if(aliases.moves[key]) moveIndex.set(fold(aliases.moves[key]),entry);
  }
  const typeByItem=new Map(Object.entries(d.typeItems).map(([type,key])=>[key,type]));
  const pokemon=new Map(d.pokemon.map((p)=>[p.id,p]));
  const modes={classic:"Classic",survival:"Survival",boss:"Boss"};
  const matches=(name,key,english,group)=>[english,aliases[group][key]].some((n)=>n && fold(n)===fold(name));
  const label=(entry,group)=>document.documentElement.lang.startsWith("es") ? aliases[group][entry.key]||entry.name : entry.name;
  const text=(root,selector)=>root.querySelector(selector)?.textContent.trim()??"";
  const shown=(el)=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=="hidden";
  let hud=null;
  let partner=null;
  let panel=null;
  let mode="classic";
  let folded=false;
  let previous="";
  let lastLevel=0;
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
  function hasGear(rows,entry,group){
    return rows.some((slot)=>{
      const name=slot.getAttribute("title")?.split(": ")[0];
      if(name) return matches(name,entry.key,entry.name,group);
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

  function readOffers(){
    const modal=[...document.querySelectorAll(".modal")].findLast(shown);
    if(!modal||modal.querySelector(".cards.banning")) return [];
    const buttons=(root,selector)=>[...root.querySelectorAll(selector)].filter((el)=>!el.disabled&&shown(el));
    const hotkey=(el,selector)=>text(el,selector).match(/^\[?(\d)\]?$/)?.[1]??"";
    const levelUp=buttons(modal,"button.card.offer");
    if(levelUp.length) return levelUp.map((el)=>({kind:"level",element:el,name:text(el,".bd h3"),hotkey:hotkey(el,".key")}));

    const blessings=buttons(modal,".cards > button.card").filter((el)=>el.querySelector('img[src*="/ui/icons/blessing.png"]'));
    if(blessings.length) return blessings.map((el)=>({kind:"blessing",element:el,name:text(el,".bd h3"),hotkey:hotkey(el,".key")}));

    const dojo=buttons(modal,".dj-grid > button.dj-stat");
    if(dojo.length) return dojo.map((el)=>{
      const start=el.classList.contains("on")?buttons(modal,"button.dj-go")[0]:null;
      return {kind:"blessing",element:start||el,name:text(el,"span"),start:!!start};
    });

    const relics=buttons(modal,".rl-cards > button.rl-card");
    if(relics.length){
      const incoming=text(modal,".rl-incoming .rl-stats");
      const owned=[...modal.querySelectorAll(".rl-mine .rl-chip-bd > span")].map((el)=>el.textContent.trim());
      return relics.map((el)=>({
        kind:"relic",element:el,name:text(el,".rl-bd h3"),hotkey:hotkey(el,".rl-key"),
        modifiers:text(el,".rl-stats"),incoming,owned
      }));
    }

    const bill=modal.querySelector(".bm-win");
    if(bill){
      return buttons(bill,"button.bm-row:not(.off)").map((el)=>{
        const selected=el.classList.contains("sel");
        const confirm=selected?buttons(bill,"button.bm-go.fuse")[0]:null;
        const fuseTab=selected&&!confirm?buttons(bill,".bm-tabs > button.bm-tab:first-child")[0]:null;
        return {kind:"fusion",element:confirm||fuseTab||el,name:text(el,".bm-rtx b"),hotkey:confirm||fuseTab?"":hotkey(el,".bm-key"),confirm:!!confirm};
      });
    }

    const shop=modal.classList.contains("shop-modal");
    const itemCards=buttons(modal,".cards > button.card:not(.pact)").filter((el)=>
      iconKey(el) && Number(el.style.opacity||1)>=1 && (!shop||el.querySelector(".price.ok"))
    );
    if(itemCards.length) return itemCards.map((el)=>({kind:"item",element:el,name:text(el,".bd h3"),hotkey:hotkey(el,".key")}));

    const single=modal.querySelector(":scope > div.card");
    const take=buttons(modal,":scope > .actions > button.btn.green.big")[0];
    return single&&take&&iconKey(single) ? [{kind:"item",element:take,name:text(single,".bd h3"),hotkey:""}] : [];
  }

  function readRun(root){
    const moveSlots=[...root.querySelectorAll(".hud-bl .bl-row > .slots > .slot")];
    const known=moveSlots.map((slot)=>{
      const level=text(slot,".lvl");
      return {
        names:text(slot,".nm").split(" + ").filter(Boolean),
        displayLevel:level,
        level:level==="MAX"||slot.classList.contains("linked")?8:Number(level)||0,
        merged:slot.classList.contains("fused")||slot.classList.contains("linked")
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

  function itemScore(item,types,values){
    if(!item) return 0;
    const type=typeByItem.get(item.key);
    if(type) return types.has(type)?1.8:.25;
    if(item.key==="shell-bell") return values.lifesteal*.8;
    if(item.key==="leftovers") return values.regen*1.7;
    if(item.key==="focus-sash"||item.key==="max-revive") return values.armor*1.8;
    const modifiers=item.effect.split(/\.\s/)[0].split(/\s+(?:and|e|but)\s+|,\s+(?=[+−-])/);
    // Score flat modifiers only when we can read the full first clause, including any trade-off.
    const parsed=modifiers.map(stats.parse);
    return parsed.every(Boolean)?parsed.reduce((sum,mod)=>sum+stats.score(mod,values),0):0;
  }

  function suggest(b,run){
    const state=b.kit.map((move,index)=>({
      move,
      unlocked:run.level>=offerLevels[index],
      level:Math.max(0,...run.known.filter((slot)=>slot.names.some((n)=>matches(n,move.key,move.name,"moves"))).map((s)=>s.level))
    }));
    const fused=run.known.some((s)=>s.merged && s.names.some((n)=>matches(n,b.fusion.key,b.fusion.name,"fusions")));
    const linked=run.known.some((s)=>s.merged && b.fusion.moves.every((key)=>s.names.some((n)=>matches(n,key,d.moves[key].name,"moves"))));
    const trackFusion=!b.fusion.limited&&!fused&&!linked;
    const pair=trackFusion?b.fusion.moves.map((key)=>state.find((s)=>s.move.key===key)):[];
    const ready=pair.length===2&&pair.every((s)=>s.level>=8);
    const missingItems=b.items.filter((x)=>!hasGear(run.items,x,"items"));
    const missingVits=b.vitamins.filter((x)=>!hasGear(run.vitamins,x,"vitamins"));
    const priority=state.find((s)=>s.move.key===b.priority.key);
    const available=state.filter((s)=>s.unlocked&&(s.level>0||run.freeSlots));
    const active=run.known.flatMap((slot)=>slot.names.map((name)=>moveIndex.get(fold(name))).filter(Boolean));
    const types=new Set([...active,...b.kit].filter((move)=>move.cls!=="status").map((move)=>move.type));
    const values=stats.weights(b,run,mode,active);
    const statTotal=(value)=>{
      const mods=value.split(" · ").map(stats.parse);
      return mods.every(Boolean)?mods.reduce((sum,mod)=>sum+stats.score(mod,values),0):null;
    };
    const reserved=pair.filter((s)=>s.level===0).length;
    const early=run.level<5 && run.known.filter((s)=>s.names.length).length<=1;
    const cards=run.offers.map((card)=>{
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
        const item=d.items.find((x)=>matches(card.name,x.key,x.name,"items"));
        const index=b.items.indexOf(item);
        const owned=item&&hasGear(run.items,item,"items");
        const bonus=itemScore(item,types,values);
        const score=index>=0&&!owned?60-index:bonus>0?Math.min(25,bonus*5+(item.rarity??0)*.05):0;
        return {...card,score,why:index>=0&&!owned?"Oggetto da cercare per la tua build.":"Bonus utile tra gli oggetti disponibili."};
      }
      if(card.kind==="fusion"){
        const signature=trackFusion&&matches(card.name,b.fusion.key,b.fusion.name,"fusions");
        return {...card,score:signature?100:0,why:card.confirm?"Conferma la fusione firma.":"Seleziona la coppia e scegli Fusione."};
      }
      const move=state.find((s)=>matches(card.name,s.move.key,s.move.name,"moves"));
      if(fused&&matches(card.name,b.fusion.key,b.fusion.name,"fusions")) return {...card,score:95,why:"Potenzia la fusione firma."};
      if(move){
        if(move.level===0&&!run.freeSlots) return {...card,score:0};
        const ingredient=pair.includes(move);
        const priorityMove=move===priority;
        const score=ingredient&&move.level<8
          ? 80+(move.level===0?7:0)+(priorityMove?2:0)
          : priorityMove?74:early&&move.level>0?68:move.level>0?56:44;
        return {...card,score,why:ingredient&&move.level<8?"Ingrediente della fusione firma.":priorityMove?"Priorità del tuo obiettivo.":"Mossa del kit consigliato."};
      }
      const vitamin=d.vitamins.find((x)=>matches(card.name,x.key,x.name,"vitamins"));
      if(vitamin){
        const index=b.vitamins.indexOf(vitamin);
        const bonus=stats.score(stats.parse(vitamin.effect.split(" per livello comune")[0]),values);
        return {...card,score:index>=0?38-index:Math.min(22,bonus*8),why:index>=0?"Vitamina consigliata per questa build.":"Bonus alternativo utile in questa fase."};
      }
      const alternative=moveIndex.get(fold(card.name));
      if(!alternative) return {...card,score:0};
      const held=active.includes(alternative);
      const affinity=alternative.cls==="status"?0:values[alternative.cls]??0;
      const canLearn=run.freeSlots>reserved&&affinity>0&&types.has(alternative.type);
      return {...card,score:held?25+affinity:canLearn?15:0,why:held?"Potenzia una mossa che stai già usando.":"Copertura coerente con la tua build."};
    }).sort((a,b)=>b.score-a.score);
    const nextIngredient=pair.find((s)=>s.unlocked&&s.level===0&&run.freeSlots)??pair.find((s)=>s.level>0&&s.level<8);
    const target=nextIngredient??(available.includes(priority)?priority:available.find((s)=>s.move.cls!=="status"));
    const caption=fused?"Fusione completata":linked?"Mosse unite":ready?"Fusione pronta":run.level<=2?"Partenza":"Costruisci il kit";
    const choice=cards[0]?.score>0?cards[0]:null;
    let title,why;
    if(choice){
      title=choice.name;
      why=choice.why;
    } else if(cards.length){
      title="Nessuna priorità tra le offerte";
      why="Le offerte disponibili richiedono una scelta manuale.";
    } else if(ready){
      title=label(b.fusion,"fusions");
      why="Entrambi gli ingredienti sono al livello 8. Cerca la Macchina di Bill.";
    } else if(fused){
      title=label(b.fusion,"fusions");
      why="Potenzia la fusione quando compare. Usa lo slot libero per la copertura che ti manca.";
    } else if(target){
      title=(target.level>0?"Potenzia ":"Cerca ")+label(target.move,"moves");
      why=target===nextIngredient?"Porta a livello 8 i due ingredienti della fusione.":"Priorità per il kit selezionato.";
    } else {
      title="Cerca un potenziamento utile";
      why=run.freeSlots?"Aspetta le offerte delle mosse del tuo kit.":"Gli slot sono pieni. Potenzia una mossa utile già equipaggiata.";
    }
    return {choice,caption,title,why,pair,missingItems,missingVits};
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
    advice.append(create("span",recommended?"Consigliato ora":run.offers.length?"Offerte in gioco":result.caption,"pbrl-kicker"),pick,create("small",result.why));
    panel.append(advice);
    const info=create("div","","pbrl-info");
    const equipped=run.known.filter((s)=>s.names.length).map((s)=>s.names.join(" + ")+" "+s.displayLevel).join(" · ");
    if(equipped) info.append(create("small","In uso · "+equipped,"pbrl-gear"));
    if(result.pair.length){
      const row=create("div","","pbrl-pair");
      row.append(create("span","Per la fusione","pbrl-kicker"));
      for(const s of result.pair){
        const ingredient=create("div","","pbrl-ingredient"+(s.level>=8?" pbrl-ready":""));
        ingredient.append(create("span",label(s.move,"moves")),create("b",s.level?Math.min(s.level,8)+"/8":"—"));
        row.append(ingredient);
      }
      info.append(row);
    } else if(plan.fusion.limited){
      info.append(create("small","Fusione firma esclusa dal menu standard di Bill.","pbrl-gear"));
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
