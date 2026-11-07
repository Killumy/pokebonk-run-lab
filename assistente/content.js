"use strict";

(()=>{
  const d=window.BONK;
  const {build,offerLevels}=window.BONK_BUILD;
  const aliases=window.BONK_ASSIST_ALIASES;
  const pokemon=new Map(d.pokemon.map((p)=>[p.id,p]));
  const modes={classic:"Classic",survival:"Survival",boss:"Boss"};
  const fold=(s)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
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
    const offers=[...document.querySelectorAll("button.card.offer")].filter(shown).map((card)=>({
      name:text(card,".bd h3"),
      hotkey:text(card,".key").match(/^\[(\d)\]$/)?.[1]??""
    })).filter((card)=>card.name);
    return {
      level, known, offers,
      free:moveSlots.some((slot)=>slot.classList.contains("empty")),
      items:[...root.querySelectorAll(".hud-br > .itm")],
      vitamins:[...root.querySelectorAll(".hud-bl > .slots > .slot.mini:not(.empty)")]
    };
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
    const available=state.filter((s)=>s.unlocked&&(s.level>0||run.free));
    const early=run.level<5 && run.known.filter((s)=>s.names.length).length<=1;
    const cards=run.offers.map((card)=>{
      const move=state.find((s)=>matches(card.name,s.move.key,s.move.name,"moves"));
      if(fused&&matches(card.name,b.fusion.key,b.fusion.name,"fusions")) return {...card,score:95,why:"Potenzia la fusione firma."};
      if(move){
        if(move.level===0&&!run.free) return {...card,score:0};
        const ingredient=pair.includes(move);
        const priorityMove=move===priority;
        const score=ingredient&&move.level<8
          ? 80+(move.level===0?7:0)+(priorityMove?2:0)
          : priorityMove?74:early&&move.level>0?68:move.level>0?56:44;
        return {...card,score,why:ingredient&&move.level<8?"Ingrediente della fusione firma.":priorityMove?"Priorità del tuo obiettivo.":"Mossa del kit consigliato."};
      }
      const vitamin=b.vitamins.find((x)=>matches(card.name,x.key,x.name,"vitamins"));
      if(vitamin) return {...card,score:38-b.vitamins.indexOf(vitamin),why:"Vitamina consigliata per questa build."};
      return {...card,score:0};
    }).sort((a,b)=>b.score-a.score);
    const nextIngredient=pair.find((s)=>s.unlocked&&s.level===0&&run.free)??pair.find((s)=>s.level>0&&s.level<8);
    const target=nextIngredient??(available.includes(priority)?priority:available.find((s)=>s.move.cls!=="status"));
    const caption=fused?"Fusione completata":linked?"Mosse unite":ready?"Fusione pronta":run.level<=2?"Partenza":"Costruisci il kit";
    let title,why;
    if(cards.length&&cards[0].score>0){
      const card=cards[0];
      title=(card.hotkey?card.hotkey+" · ":"")+card.name;
      why=card.why;
    } else if(cards.length){
      title="Nessuna priorità in queste carte";
      why="Scegli in base a ciò che manca alla run oppure aggiorna le offerte.";
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
      why=run.free?"Aspetta le offerte delle mosse del tuo kit.":"Gli slot sono pieni. Potenzia una mossa utile già equipaggiata.";
    }
    return {caption,title,why,pair,fused,linked,missingItems,missingVits};
  }

  function render(p,run,result){
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
    panel.append(select);
    const advice=create("div","","pbrl-advice");
    advice.append(create("span",run.offers.length?"CARTA CONSIGLIATA":result.caption,"pbrl-kicker"),create("strong",result.title),create("small",result.why));
    panel.append(advice);
    const equipped=run.known.filter((s)=>s.names.length).map((s)=>s.names.join(" + ")+" "+s.displayLevel).join(" · ");
    if(equipped) panel.append(create("small","In uso · "+equipped,"pbrl-gear"));
    if(result.pair.length){
      const row=create("div","","pbrl-pair");
      for(const s of result.pair) row.append(create("span",label(s.move,"moves")+" "+(s.level?s.level+"/8":"—"),s.level>=8?"pbrl-ready":""));
      panel.append(row);
    } else if(plan.fusion.limited){
      panel.append(create("small","Fusione firma esclusa dal menu standard di Bill."));
    }
    if(result.missingItems.length){
      const gear=result.missingItems.slice(0,2).map((x)=>label(x,"items")).join(" · ");
      panel.append(create("small","Oggetti da cercare · "+gear,"pbrl-gear"));
    }
    if(result.missingVits.length){
      panel.append(create("small","Vitamina da cercare · "+label(result.missingVits[0],"vitamins"),"pbrl-gear"));
    }
  }

  function refresh(){
    const root=document.getElementById("hud");
    const species=Number(root?.querySelector(".tl-portrait[data-k]")?.getAttribute("data-k"));
    const form=pokemon.get(species);
    if(!root||!form||!shown(root)){
      if(panel) panel.hidden=true;
      if(!root){hud=null;partner=null;previous="";}
      return;
    }
    const run=readRun(root);
    if(root!==hud||run.level<lastLevel){
      hud=root;
      partner=pokemon.get(form.partner);
      folded=false;
      previous="";
      plan=partner?.league ? build(partner,mode) : null;
    }
    lastLevel=run.level;
    if(!plan) return;
    if(!panel) mount();
    if(panel.hidden) panel.hidden=false;
    attach();
    const result=suggest(plan,run);
    const stamp=JSON.stringify([species,run.level,mode,folded,run.known,run.offers.length,result]);
    if(stamp!==previous){
      previous=stamp;
      render(form,run,result);
    }
  }

  setInterval(refresh,300);
  document.addEventListener("fullscreenchange",refresh);
  refresh();
})();
