"use strict";
const d=window.BONK;
const $=(id)=>document.getElementById(id);
const h=(v)=>String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const norm=(v)=>String(v??"").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/’/g,"'");
const find=(query,...values)=>values.some((value)=>norm(value).includes(query));
const id=new Map(d.pokemon.map((p)=>[p.id,p]));
const keys=new Map(d.pokemon.map((p)=>[p.key,p]));
const league=d.pokemon.filter((p)=>p.league);
// Classic solo, strongest first in each tier. Weigh opening, waves, bosses and survival.
const tiers=[
  ["S++",["articuno","suicune","ho-oh"]],
  ["S+",["gastly","shellder","raikou","bulbasaur","heracross"]],
  ["S",["clefairy","tangela","celebi","nidoran-m","chikorita","drowzee"]],
  ["A",[
    "zapdos","moltres","mewtwo","lapras","grimer","slowpoke","scyther","nidoran-f",
    "staryu","entei","skarmory","abra","kangaskhan","growlithe","lugia","poliwag",
    "pinsir","oddish","pikachu","charmander","chansey","squirtle","houndour","chinchou",
    "magmar","voltorb","seel","cubone","electabuzz","wooper","jynx","porygon",
    "cyndaquil","larvitar","mew"
  ]],
  ["B",[
    "dratini","totodile","aerodactyl","tentacool","miltank","stantler","paras","zubat",
    "corsola","kabuto","geodude","ponyta","misdreavus","mareep","marill","lickitung",
    "teddiursa","dunsparce","rattata","pidgey","sneasel","eevee","yanma","murkrow",
    "remoraid","mantine","ledyba","magby","smoochum","togepi","venonat","smeargle",
    "machop","vulpix","hitmonchan","onix","exeggcute","ekans","sandshrew","omanyte",
    "snorlax","bellsprout","horsea","hitmonlee","tauros","spearow","goldeen","diglett","spinarak"
  ]],
  ["C",[
    "krabby","hitmontop","phanpy","rhyhorn","jigglypuff","meowth","doduo","magnemite",
    "mr-mime","psyduck","mankey","hoothoot","elekid","gligar","cleffa","qwilfish",
    "snubbull","weedle","tyrogue","sentret","swinub","aipom","slugma","pineco",
    "hoppip","caterpie","pichu","igglybuff","girafarig","unown","natu","sudowoodo",
    "delibird","wobbuffet"
  ]],
  ["D",["koffing","farfetchd","ditto","shuckle","sunkern"]],
  ["E",["magikarp"]]
];
const rankByKey=new Map(tiers.flatMap(([tier,partners],tierIndex)=>
  partners.map((key,index)=>[key,{tier,tierIndex,position:index+1}])
));
const signatures=new Map(d.fusions.filter((f)=>f.member).map((f)=>[f.member,f]));
const items=new Map(d.items.map((i)=>[i.key,i]));
const vits=new Map(d.vitamins.map((v)=>[v.key,v]));
const move=(k)=>d.moves[k].name;
const rarity=["Comune","Non comune","Raro","Epico","Leggendario"];
const damage={physical:"Fisico",special:"Speciale"};
const tone={normal:"#d3c8ad",fighting:"#ff9b8e",flying:"#c8b4fa",poison:"#e9a8ed",ground:"#edc187",rock:"#ddc288",bug:"#c5dc86",ghost:"#c7b2ee",steel:"#c9d5e2",fire:"#ffa98a",water:"#9ac7fc",grass:"#afd794",electric:"#f4d478",psychic:"#f6a4c0",ice:"#a4e2e5",dragon:"#b7afff",dark:"#d4bcae",fairy:"#ffbfe3"};
const type=(x)=>d.types[x];
const tags=(ts)=>'<span class="types">'+ts.map((t)=>'<span class="type" style="--tone:'+tone[t]+'">'+h(type(t))+'</span>').join("")+'</span>';
const grade=(tier)=>'<span class="grade" data-tier="'+h(tier)+'">'+h(tier)+'</span>';
const art=(p)=>'<img class="sprite" src="art/'+p.id+'.png" width="96" height="96" alt="" loading="lazy">';
const portrait=(p,cls)=>'<img class="'+cls+'" src="art/portraits/'+p.id+'.webp" width="200" height="200" alt="" loading="lazy">';
const illustration=(folder,key)=>'<img class="entry-icon" src="art/'+folder+'/'+h(key)+'.png" width="34" height="34" alt="" loading="lazy">';
const typeArt=(type)=>illustration("types",type);
const gearArt=(x)=>illustration(x.rarity==null?"vitamins":"items",x.key);
const number=(p)=>"#"+String(p.id).padStart(3,"0");
const regions=[["","Tutte le regioni"],["1","Kanto"],["2","Johto"]];
const pages={
  classifica:["01 / LEGA","Classifica Pokémon",'Classifica editoriale per Classic in singolo, dal più forte al meno forte in ogni tier. Pesano la partenza, le ondate, i boss e la sopravvivenza. Base di confronto <a href="https://pokebonk.co/tier-list" target="_blank" rel="noopener">community v0.9.8</a>.',"Cerca Pokémon, evoluzione o mossa…"],
  pokedex:["02 / KANTO + JOHTO","Pokédex","Esplora le specie e apri la build del relativo partner di Lega.","Cerca nome, numero o tipo…"],
  oggetti:["03 / EQUIPAGGIAMENTO","Oggetti e vitamine","Cerca bonus e limiti per run. Alcuni effetti sono riportati in inglese, come nel client.","Cerca nome, effetto o statistica…"],
  fusioni:["04 / MACCHINA DI BILL","Fusioni","Cerca una fusione firma, un ingrediente o un tipo. Le mosse devono raggiungere il livello 8.","Cerca una mossa, una fusione o un Pokémon…"]
};
const modes={classic:"Classic",survival:"Survival",boss:"Boss"};
const state=Object.fromEntries(Object.keys(pages).map((k)=>[k,{q:"",tier:"",region:"",type:"",sort:k==="classifica"?"tier":"id",kind:"",rare:"",limit:24}]));
let active="classifica";
let current=null;
let mode="classic";
const select=(label,key,options,value)=>'<select class="filters" aria-label="'+label+'" data-field="'+key+'">'+options.map(([v,l])=>'<option value="'+h(v)+'"'+(value===v?' selected':'')+'>'+h(l)+'</option>').join("")+'</select>';
const buttons=(field,options,value)=>options.map(([v,l])=>'<button type="button" class="pill" data-field="'+field+'" data-value="'+h(v)+'" aria-pressed="'+(v===value)+'">'+h(l)+'</button>').join("");
function page() {
  const [kicker,title,summary,placeholder]=pages[active];
  const s=state[active];
  $("kicker").textContent=kicker;
  $("title").textContent=title;
  $("summary").innerHTML=summary;
  $("hero").hidden=$("facts").hidden=active!=="classifica";
  document.querySelectorAll("nav a").forEach((a)=>a.hash==="#"+active?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current"));
  let control='<input type="search" id="search" aria-label="Cerca in '+title+'" placeholder="'+placeholder+'" value="'+h(s.q)+'">';
  if(active==="classifica") control+='<div class="tier-filters" role="group" aria-label="Filtra per tier">'+buttons("tier",[["","Tutti"],...tiers.map(([t])=>[t,t])],s.tier)+'</div>';
  if(active==="classifica" || active==="pokedex"){
    control+=select("Regione","region",regions,s.region);
    control+=select("Tipo","type",[["","Tutti i tipi"],...Object.entries(d.types).sort((a,b)=>a[1].localeCompare(b[1],"it"))],s.type);
    control+=select("Ordina","sort",[...(active==="classifica"?[["tier","Per forza"]]:[]),["id","Numero Pokédex"],["name","Nome A–Z"]],s.sort);
  } else if(active==="oggetti"){
    control+=buttons("kind",[["","Tutti"],["items","Oggetti"],["vit","Vitamine"]],s.kind);
    if(s.kind!=="vit") control+=select("Rarità","rare",[["","Tutte le rarità"],...rarity.map((r,i)=>[String(i),r])],s.rare);
  } else control+=buttons("kind",[["","Tutte"],["signature","Firma"],["other","Altre"]],s.kind);
  if(active==="classifica") control+='<button class="pill" type="button" data-reset>Azzera ↺</button>';
  $("controls").innerHTML=control;
  results();
}
function pokemonResults(s,q,ranked) {
  return (ranked?league:d.pokemon).filter((p)=>{
    if(s.region && Number(s.region)!==p.gen) return false;
    if(s.type && !p.types.includes(s.type)) return false;
    if(ranked && s.tier && s.tier!==rankByKey.get(p.key).tier) return false;
    if(!q) return true;
    const kit=ranked?p.league.kit.map(move):[];
    const forms=ranked?p.league.forms.map((x)=>id.get(x).name):[];
    return find(q,p.name,p.id,number(p),number(p).slice(1),...p.types,...p.types.map(type),...kit,...forms,signatures.get(p.id)?.name);
  }).sort((a,b)=>{
    const names=()=>a.name.localeCompare(b.name,"it");
    if(ranked && s.sort==="tier"){
      const left=rankByKey.get(a.key),right=rankByKey.get(b.key);
      return left.tierIndex-right.tierIndex || left.position-right.position;
    }
    if(s.sort==="name") return names();
    return a.id-b.id;
  });
}
function row(p) {
  const sig=signatures.get(p.id);
  const rank=rankByKey.get(p.key);
  const evolved=p.league.forms.filter((x)=>x!==p.id).map((x)=>id.get(x).name);
  return '<button class="row" type="button" data-open="'+p.key+'"><span class="rank-cell">'+grade(rank.tier)+'<small class="rank-number" aria-label="Posizione '+rank.position+' nel tier '+rank.tier+'">#'+rank.position+'</small></span><span class="pokemon">'+art(p)+'<span><strong>'+h(p.name)+'</strong><small class="dim">'+h(evolved.join(" · ") || regions[p.gen][1])+'</small></span></span>'+tags(p.types)+'<span class="role">'+damage[sig.cls]+'</span><span class="fusion">'+h(sig.name)+'</span><span class="arrow" aria-hidden="true">↗</span></button>';
}
function recipe(f) {
  if(f.member) return f.moves.map(move).join(" + ");
  if(f.kind==="type") return "Due mosse compatibili di tipo "+type(f.types[0])+".";
  if(f.pair) return f.pair.map((group)=>group.map(type).join(" o ")).join(" + ");
  return "Coppia compatibile senza fusione firma, di reazione o dello stesso tipo.";
}
function results() {
  const s=state[active],q=norm(s.q.trim());
  let matches, label, content;
  if(active==="classifica" || active==="pokedex"){
    const ranked=active==="classifica";
    matches=pokemonResults(s,q,ranked);
    label=ranked?"partner di Lega":"Pokémon";
    const visible=matches.slice(0,s.limit);
    content=ranked?'<div class="board"><div class="row row-head" aria-hidden="true"><span>TIER</span><span>POKÉMON</span><span>TIPO</span><span class="role">CLASSE FUSIONE</span><span class="fusion">FUSIONE FIRMA</span><span></span></div>'+visible.map(row).join("")+'</div>'
      : '<div class="tile-grid">'+visible.map((p)=>'<button class="tile" type="button" data-open="'+p.key+'"><span class="tile-top">'+portrait(p,"dex-portrait")+'<span class="dim">'+number(p)+'</span></span><strong>'+h(p.name)+'</strong><br>'+tags(p.types)+'</button>').join("")+'</div>';
  } else if(active==="oggetti"){
    const pool=s.kind==="vit"?d.vitamins:s.kind==="items"||s.rare?d.items:[...d.items,...d.vitamins];
    matches=pool.filter((x)=>(!s.rare||x.rarity===Number(s.rare))&&find(q,x.name,x.effect,rarity[x.rarity]));
    label="risultati";
    content='<div class="tile-grid">'+matches.slice(0,s.limit).map((x)=>'<article class="tile"><div class="tile-title">'+gearArt(x)+'<div><span class="eyebrow">'+(x.rarity==null?"Vitamina":rarity[x.rarity])+'</span><h3>'+h(x.name)+'</h3></div></div><p>'+h(x.effect)+'</p>'+(x.max?'<small class="dim">Massimo '+x.max+' per run</small>':'')+'</article>').join("")+'</div>';
  } else {
    matches=d.fusions.filter((f)=>(!s.kind||(s.kind==="signature"?f.member:!f.member))&&find(q,f.name,recipe(f),...f.types,...f.types.map(type),id.get(f.member)?.name));
    label="fusioni";
    content='<div class="tile-grid">'+matches.slice(0,s.limit).map((f)=>'<article class="tile"><div class="fusion-art">'+(f.member?portrait(id.get(f.member),"fusion-portrait"):"")+'<div class="pair-art">'+pairArt(f)+'</div></div>'+tags(f.types)+'<h3>'+h(f.name)+'</h3><p>'+h(recipe(f))+'</p>'+(f.limited?'<small class="dim">Ingrediente escluso dal menu standard</small>':'')+(f.reference?'<small class="dim">Riferimento v'+h(f.reference)+'</small>':'')+(f.member?'<br><button type="button" data-open="'+id.get(f.member).key+'">'+h(id.get(f.member).name)+' ↗</button>':'')+'</article>').join("")+'</div>';
  }
  $("count").textContent=matches.length+" "+label;
  $("results").innerHTML=matches.length?content:'<div class="empty">Nessuna corrispondenza. Prova un altro termine o rimuovi un filtro.</div>';
  $("more").innerHTML=matches.length>s.limit?'<button class="more" type="button" data-more>Mostra altri ↓</button>':"";
}

const notes={
  1:"Usa Sleep Powder per guadagnare spazio e Solar Beam per aprirti un corridoio. Razor Leaf rimane utile anche per preparare Flower Beam.",
  4:"Fire Spin tiene la pressione mentre ti muovi. Portalo avanti con Flamethrower per preparare Fiery Whirlwind. Se il danno basta, investi in mobilità e recupero.",
  7:"Parti da Water Gun. Rapid Spin aiuta contro i nemici vicini e Hydro Pump copre la distanza. Insieme sbloccano la possibilità di fondere Hydro Spiral.",
  152:"Sfrutta Sweet Scent quando la folla si stringe. Grass Pledge e Frenzy Plant sono gli investimenti per Ancient Forest.",
  155:"Costruisci attorno alle bruciature. Conserva Fire Pledge e Blast Burn se vuoi preparare Igneous Wall.",
  158:"Ice Fang aiuta a creare spazio. Usa Flip Turn per riposizionarti e conserva Water Pledge e Jaw Lock per Tide of Jaws.",
  214:"Pin Missile permette di colpire a distanza. Portalo avanti con Megahorn per preparare Missile Horn.",
  245:"Sfrutta Chilling Water per tenere spazio e sviluppa Origin Pulse per la fusione. Recupero e mobilità aiutano contro le ondate.",
  250:"Beak Blast e Burn Up sono gli investimenti per Rainbow Fire. Se queste mosse portano la run, aumenta il danno Fuoco."
};
const areas=new Set(["nova","spin","cone","wave","vortex","trap","lob","orbit","aura"]);
const target=new Set(["strike","bolt","beam","barrage","homing","smite","dash","meteor","drain","boomerang","chain","orb"]);
const projectiles=new Set(["bolt","barrage","homing","boomerang","orb"]);
const control=new Set(["freeze","sleep","paralysis","confusion","trap","flinch"]);
function build(p,goal) {
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
    notes[p.id]||('Apri con '+kit[0].name+' e potenzia '+priority.name+' quando compare. '+(fusion.limited?'Cerca una mossa complementare per coprire la distanza o la folla.':'Se la run regge già le ondate, conserva gli ingredienti per '+fusion.name+'.'));
  if(p.id===198) strategy+=" Dalla v0.9.18, il danno di Foul Play contro lo sciame finale ha un limite.";
  return {fusion,kit,priority,items:[...new Set(equipment)].map((k)=>items.get(k)).filter(Boolean),vitamins:vitamins.map((k)=>vits.get(k)),strategy};
}
const offerLevels=[1,2,4,7];
const box=(title,content)=>'<section class="box"><h3>'+title+'</h3>'+content+'</section>';
function lineage(p) {
  const members=id.get(p.partner).league.forms.map((i)=>id.get(i));
  return '<div class="lineage-section"><span class="eyebrow">FORME DELLA LINEA</span><div class="lineage" role="group" aria-label="Forme della linea">'+members.map((mon)=>{
    const picture=portrait(mon,"lineage-art")+'<span>'+h(mon.name)+'</span>';
    return mon.id===p.id ? '<span class="lineage-card current" aria-current="true">'+picture+'</span>' : '<a class="lineage-card" href="#pokemon/'+mon.key+'">'+picture+'</a>';
  }).join("")+'</div></div>';
}
function moveChip(m,caption) {
  return '<span class="guide-chip">'+typeArt(m.type)+'<span><strong>'+h(m.name)+'</strong><small>'+h(caption)+'</small></span></span>';
}
function gearChip(x) {
  const label=x.rarity==null ? "Vitamina" : rarity[x.rarity];
  return '<span class="guide-chip">'+gearArt(x)+'<span><strong>'+h(x.name)+'</strong><small>'+label+'</small></span></span>';
}
function pairArt(fusion) {
  if(!fusion.moves.length) return fusion.types.map(typeArt).join("");
  return fusion.moves.map((key)=>typeArt(d.moves[key].type)).join('<span class="dim" aria-hidden="true">+</span>');
}
function runSteps(b,goal) {
  const [start]=b.kit;
  const firstHit=b.kit.find((m)=>m.cls!=="status");
  const hitLevel=offerLevels[b.kit.indexOf(firstHit)];
  const firstAction=start.cls==="status" && firstHit && firstHit.key!==start.key
    ? "Parti con "+start.name+". Appena puoi, prendi una mossa offensiva. Nel kit, "+firstHit.name+" può comparire dal livello "+hitLevel+" del Pokémon."
    : "Parti con "+start.name+" e raccogli esperienza. Finché gestisci le ondate, investi nella mossa che sta eliminando più nemici.";
  const midAction="Prendi "+b.priority.name+" quando compare e potenziala se risponde al tuo obiettivo. Con pochi slot, tieni una mossa per colpire le ondate e una per i bersagli singoli.";
  const [inputA,inputB]=b.fusion.moves.map(move);
  const fusionPlan=b.fusion.limited
    ? ["Questa ricetta ha un ingrediente escluso dal menu standard di Bill. Continua con "+b.priority.name+" e usa gli slot rimasti per coprire ciò che manca al kit.", "Se trovi un’altra combinazione utile, controlla in gioco quali mosse Bill può unire o fondere."]
    : ["Conserva "+inputA+" e "+inputB+". Portale entrambe al livello 8 della mossa, poi cerca la Macchina di Bill.", "Se la coppia è pronta e Bill è disponibile, fondi in "+b.fusion.name+". Se manca un ingrediente, porta avanti il kit che stai già usando. Usa lo slot liberato dalla fusione per coprire la tua debolezza."];
  const finish=goal==="survival"
    ? ["Quando le ondate si infittiscono, continua a muoverti verso spazi aperti. Se i nemici ti raggiungono, scegli tenuta o mobilità. Se restano vivi troppo a lungo, rinforza la mossa che colpisce più bersagli."]
    : ["Prima del boss, assicurati di avere una mossa che riesca a colpirlo con continuità. Schiva gli attacchi annunciati e usa l’Ultimate in una finestra in cui riesci a piazzarla."];
  if(goal==="boss") finish.unshift("Prova "+b.priority.name+" contro i bersagli singoli se l’hai ancora nel kit. Se l’hai fusa, controlla che la nuova mossa riesca a raggiungere il boss.");
  const setup=goal==="survival" ? "Alterna danno ad area e difesa in base a cosa ti mette sotto pressione."
    : b.fusion.limited ? "Completa il kit con le offerte che funzionano per la tua run. La fusione firma ha un ingrediente escluso da Bill."
    : "Se punti alla fusione, tieni gli slot per i due ingredienti. Prima di forzarla, assicurati di avere abbastanza danno per avanzare.";
  const stages=[
    {title:"Partenza",sub:"Dalle prime offerte",actions:[firstAction,"Tra le prime scelte, cerca i bonus qui sotto se compaiono. Se sei già in difficoltà, prendi prima la carta che ti fa superare l’ondata."],moves:[[start,"Mossa iniziale"]],gear:[b.items[0],b.vitamins[0]]},
    {title:"Costruisci il kit",sub:"Offerte dal livello 2 del Pokémon",actions:[midAction,setup],moves:b.kit.slice(1).map((m,i)=>[m,"Dal liv. "+offerLevels[i+1]+" del Pokémon"+(m.key===b.priority.key?" · Priorità":"")]),gear:[...b.items.slice(1,3),...b.vitamins.slice(1,3)]},
    {title:"Fusione",sub:b.fusion.limited ? "Piano alternativo" : "Quando le due mosse arrivano al liv. 8",actions:fusionPlan,moves:b.fusion.moves.map((k)=>[d.moves[k],b.fusion.limited?"Ingrediente della ricetta":"Obiettivo · mossa liv. 8"]),gear:[]},
    {title:"Finale",sub:goal==="survival" ? "Ondate avanzate" : "Guardiani e boss",actions:finish,moves:[],gear:[...b.items.slice(3),...b.vitamins.slice(3)]}
  ];
  if(b.priority.key===start.key){
    stages[1].actions[0]="Continua a potenziare "+start.name+". Se hai pochi slot, scegli una mossa che completi quella iniziale contro ondate o bersagli singoli.";
  }
  return stages;
}
function timeline(stages) {
  const buttons=stages.map((s,i)=>'<button type="button" class="pill" data-step="'+i+'"><b>0'+(i+1)+'</b> '+h(s.title)+'</button>').join("");
  const sections=stages.map((s,i)=>{
    const moves=s.moves.map(([m,caption])=>moveChip(m,caption)).join("");
    const gear=s.gear.map(gearChip).join("");
    const picture=i===2 ? illustration("ui","map-bill") : i===3 ? illustration("ui","map-boss") : "";
    return '<li><section class="run-step" id="run-step-'+i+'" tabindex="-1" aria-labelledby="run-title-'+i+'"><header class="step-head"><span class="step-num" aria-hidden="true">0'+(i+1)+'</span><div><h3 id="run-title-'+i+'">'+h(s.title)+'</h3><p>'+h(s.sub)+'</p></div>'+picture+'</header><ul class="step-actions">'+s.actions.map((a)=>'<li>'+h(a)+'</li>').join("")+'</ul>'+
      (moves?'<div class="step-choices">'+moves+'</div>':"")+
      (gear?'<div class="step-gear"><span class="eyebrow">DA CERCARE</span><div class="step-choices">'+gear+'</div></div>':"")+'</section></li>';
  }).join("");
  return '<div class="run-timeline"><h3 class="run-title">Run passo per passo</h3><div class="phase-nav" role="group" aria-label="Vai a una fase della run">'+buttons+'</div><ol class="steps">'+sections+'</ol></div>';
}
function detailsReference(p,b) {
  const gearRows=(list)=>list.map((x)=>'<li class="reference-entry">'+gearArt(x)+'<span>'+(x.rarity==null ? '<strong>'+h(x.name)+'</strong>' : '<a href="#oggetti" data-item="'+h(x.name)+'">'+h(x.name)+'</a>')+'<small>'+h(x.effect)+'</small></span></li>').join("");
  const kit=b.kit.map((m,i)=>'<li>'+moveChip(m,i===0?"Iniziale":"Offerta dal liv. "+offerLevels[i]+" del Pokémon")+'</li>').join("");
  return '<details class="build-reference"><summary>Dettagli di mosse, oggetti e vitamine</summary><div class="detail-grid">'+
    box("Mosse del kit",'<ul class="reference-list">'+kit+'</ul>')+
    box("Fusione firma",'<div class="pair-art">'+pairArt(b.fusion)+'</div><p><strong>'+h(b.fusion.name)+'</strong><br>'+h(recipe(b.fusion))+'</p><small>'+(b.fusion.limited?"Ingrediente escluso dal menu standard.":"Obiettivo al livello 8 di entrambe le mosse.")+'</small>')+
    box("Oggetti",'<ul class="reference-list">'+gearRows(b.items)+'</ul>')+
    box("Vitamine",'<ul class="reference-list">'+gearRows(b.vitamins)+'</ul>')+
    box("Passiva",'<p><strong>'+h(p.league.passive)+'</strong></p><small lang="en">'+h(p.league.passiveEffect)+'</small>')+
    box("Ultimate e sblocco",'<p>'+h(p.league.ultimate)+'</p><small>'+h(p.league.unlock)+'</small>')+'</div></details>';
}
function detail() {
  const p=current;
  const rank=rankByKey.get(p.key);
  const head='<header class="detail-head">'+portrait(p,"detail-portrait")+'<div class="head-copy"><div class="eyebrow">'+number(p)+' / '+regions[p.gen][1].toUpperCase()+'</div><h2 id="detail-title">'+h(p.name)+(rank?grade(rank.tier):'')+'</h2>'+tags(p.types)+'</div><button type="button" class="close" data-close aria-label="Chiudi scheda" autofocus>×</button></header>';
  let body=rank?'<p class="rank-note">Posizione <strong>#'+rank.position+'</strong> nel tier <strong>'+rank.tier+'</strong> · Classic in singolo</p>':"";
  if(!p.league){
    const partner=id.get(p.partner);
    const statNames={hp:"PS",atk:"Attacco",def:"Difesa",spa:"Att. speciale",spd:"Dif. speciale",spe:"Velocità"};
    body+=lineage(p)+'<div class="detail-grid">'+box("Partner di Lega",'<p>La build di questa forma è nella guida di '+h(partner.name)+'.</p><a href="#pokemon/'+partner.key+'">Apri la build passo per passo ↗</a>')+
      box("Statistiche base di riferimento",'<div class="stats">'+Object.entries(statNames).map(([k,label])=>'<span>'+label+' <b>'+p.stats[k]+'</b></span>').join("")+'</div>')+'</div>';
  } else {
    const b=build(p,mode);
    body+='<div class="mode" role="group" aria-label="Obiettivo della build"><b>Obiettivo</b>'+buttons("mode",Object.entries(modes),mode)+'</div><p class="strategy">'+h(b.strategy)+'</p>'+
      timeline(runSteps(b,mode))+detailsReference(p,b)+lineage(p)+
      '<p class="dim">Mosse, oggetti e fusioni firma dal <a href="https://pokebonk.com/version.json" target="_blank" rel="noopener">client v'+h(d.version)+'</a>. Ultimate e sblocco dalla <a href="https://pokebonk.co/tier-list#'+h(p.league.anchor)+'" target="_blank" rel="noopener">guida community v0.9.8</a>. Le scelte suggerite dipendono dalle offerte e dall’andamento della run.</p>'+
      '<div class="detail-foot"><button type="button" class="primary" data-copy="build">Copia guida</button><button type="button" class="secondary" data-copy="link">Copia link ↗</button><span class="status" id="status" role="status"></span></div>';
  }
  $("detail").innerHTML=head+'<div class="detail-body">'+body+'</div>';
}
function close() {
  current=null;
  if($("detail").open) $("detail").close();
}
function dismiss() {
  history.replaceState(null,"","#"+active);
  close();
}
function route() {
  const [view,key]=location.hash.slice(1).split("/");
  const p=keys.get(key);
  if(view==="pokemon" && p){
    current=p;
    mode="classic";
    detail();
    $("detail").scrollTop=0;
    if(!$("detail").open) $("detail").showModal();
    else $("detail").querySelector("[data-close]").focus();
    return;
  }
  if(view==="catalogo" || view==="content") return;
  close();
  const next=Object.hasOwn(pages,view)?view:"classifica";
  if(active!==next){
    active=next;
    page();
    window.scrollTo({top:0,behavior:"instant"});
  }
}
async function copy(format) {
  const p=current,b=build(p,mode);
  const steps=runSteps(b,mode).map((s,i)=>{
    const moves=s.moves.map(([m,label])=>m.name+" ("+label+")").join(", ");
    const gear=s.gear.map((x)=>x.name).join(", ");
    return [(i+1)+". "+s.title,...s.actions,moves?"Mosse: "+moves:"",gear?"Da cercare: "+gear:""].filter(Boolean).join("\n");
  });
  const lines=[p.name+" · "+modes[mode],b.strategy,...steps,location.href];
  try {
    await navigator.clipboard.writeText(format==="link"?location.href:lines.filter(Boolean).join("\n"));
    if(current===p && $("status")) $("status").textContent=format==="link"?"Link copiato":"Build copiata";
  } catch {
    if(current===p && $("status")) $("status").textContent="Copia non riuscita";
  }
}
$("detail").addEventListener("cancel",(e)=>{e.preventDefault();dismiss();});
$("detail").addEventListener("click",(e)=>{if(e.target===$("detail")) dismiss();});
document.addEventListener("input",(e)=>{
  if(e.target.id!=="search") return;
  state[active].q=e.target.value;
  state[active].limit=24;
  results();
});
document.addEventListener("change",(e)=>{
  if(!e.target.matches("select[data-field]")) return;
  state[active][e.target.dataset.field]=e.target.value;
  state[active].limit=24;
  results();
});
document.addEventListener("click",(e)=>{
  const b=e.target.closest("button,a");
  if(!b) return;
  if(b.hasAttribute("data-open")) location.hash="pokemon/"+b.dataset.open;
  if(b.hasAttribute("data-close")) dismiss();
  if(b.hasAttribute("data-step")){
    const step=$("run-step-"+b.dataset.step);
    step.focus({preventScroll:true});
    step.scrollIntoView({block:"start"});
  }
  if(b.hasAttribute("data-copy")) void copy(b.dataset.copy);
  if(b.hasAttribute("data-item")){
    Object.assign(state.oggetti,{q:b.dataset.item,kind:"items",rare:"",limit:24});
    if(active==="oggetti") page();
  }
  if(b.hasAttribute("data-more")){
    const before=state[active].limit;
    state[active].limit+=24;
    results();
    const cards=$("results").querySelectorAll(active==="classifica"?".board button":".tile");
    const first=cards[before];
    if(first){first.tabIndex=0;first.focus({preventScroll:true});first.scrollIntoView({block:"nearest"});}
  }
  if(b.hasAttribute("data-reset")){
    Object.assign(state.classifica,{q:"",tier:"",region:"",type:"",sort:"tier",limit:24});
    page();
    $("search").focus();
  }
  const field=b.dataset.field;
  if(field==="mode"){
    mode=b.dataset.value;
    detail();
    $("detail").querySelector('[data-value="'+mode+'"]').focus({preventScroll:true});
  } else if(field){
    state[active][field]=b.dataset.value;
    if(field==="tier") state.classifica.sort="tier";
    if(active==="oggetti"&&b.dataset.value==="vit") state.oggetti.rare="";
    state[active].limit=24;
    page();
    [...$("controls").querySelectorAll("button[data-field]")].find((x)=>x.dataset.field===field&&x.dataset.value===b.dataset.value)?.focus();
  }
});
window.addEventListener("hashchange",route);
$("facts").innerHTML=[[league.length,"Partner di Lega","✦"],[d.pokemon.length,"Specie nel Pokédex","◎"],[d.items.length,"Oggetti in run","◇"],[d.fusions.length,"Fusioni","⚡"]].map(([n,name,icon])=>'<div class="fact"><span class="fact-icon" aria-hidden="true">'+icon+'</span><span><b>'+n+'</b><small>'+name+'</small></span></div>').join("");
page();
route();
