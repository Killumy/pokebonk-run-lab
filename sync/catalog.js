"use strict";

(function(root){
  const parser=typeof module==="object"?require("./vendor/acorn.js"):root.acorn;
  const origin="https://pokebonk.com";
    const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const unknown=Symbol("unknown");
  const key=(node)=>node?.type==="Identifier"?node.name:node?.value;
  const property=(node,name)=>node?.properties?.find((p)=>p.type==="Property"&&key(p.key)===name)?.value;

  function source(code,translations){
    const tree=parser.parse(code,{ecmaVersion:"latest",sourceType:"module"});
    const variables=new Map(),nodes=[],translate=new Set();
    function walk(node){
      if(!node||typeof node!=="object"||!node.type) return;
      nodes.push(node);
      if(node.type==="VariableDeclarator"&&node.id.type==="Identifier") variables.set(node.id.name,node.init);
      if(node.type==="ImportDeclaration"&&node.source.value.includes("i18n-")){
        for(const spec of node.specifiers) if(spec.imported?.name==="u") translate.add(spec.local.name);
      }
      for(const value of Object.values(node)){
        if(Array.isArray(value)) value.forEach(walk);
        else if(value&&typeof value==="object"&&value.type) walk(value);
      }
    }
    walk(tree);
    const resolving=new Set();
    function read(node,scope={}){
      if(!node) return unknown;
      switch(node.type){
        case "Literal": return node.regex?new RegExp(node.regex.pattern,node.regex.flags):node.value;
        case "Identifier": {
          if(Object.hasOwn(scope,node.name)) return scope[node.name];
          if(node.name==="undefined") return undefined;
          if(resolving.has(node.name)||!variables.has(node.name)) return unknown;
          resolving.add(node.name);
          const value=read(variables.get(node.name),scope);
          resolving.delete(node.name);
          return value;
        }
        case "TemplateLiteral": {
          const values=node.expressions.map((n)=>read(n,scope));
          if(values.includes(unknown)) return unknown;
          return node.quasis.map((part,i)=>part.value.cooked+(i<values.length?values[i]:"")).join("");
        }
        case "UnaryExpression": {
          const value=read(node.argument,scope);
          if(value===unknown) return unknown;
          if(node.operator==="-") return -value;
          if(node.operator==="+") return +value;
          if(node.operator==="!") return !value;
          return unknown;
        }
        case "BinaryExpression": {
          const a=read(node.left,scope),b=read(node.right,scope);
          if(a===unknown||b===unknown) return unknown;
          if(node.operator==="+") return a+b;
          if(node.operator==="-") return a-b;
          if(node.operator==="*") return a*b;
          if(node.operator==="/") return a/b;
          return unknown;
        }
        case "ArrayExpression": {
          const result=[];
          for(const n of node.elements){
            const value=read(n?.type==="SpreadElement"?n.argument:n,scope);
            if(n?.type==="SpreadElement"&&Array.isArray(value)) result.push(...value);
            else if(value!==unknown) result.push(value);
          }
          return result;
        }
        case "ObjectExpression": {
          const result={};
          for(const p of node.properties){
            if(p.type==="SpreadElement"){
              const value=read(p.argument,scope);
              if(value&&value!==unknown) Object.assign(result,value);
              continue;
            }
            if(p.type!=="Property"||p.method) continue;
            const name=p.computed?read(p.key,scope):key(p.key);
            if(name===unknown||name==="__proto__"||name==="constructor"||name==="prototype") continue;
            const value=read(p.value,scope);
            if(value!==unknown) result[name]=value;
          }
          return result;
        }
        case "CallExpression": {
          const name=node.callee.name;
          const args=node.arguments.map((n)=>read(n,scope));
          if(translate.has(name)&&typeof args[0]==="string"){
            const text=translations[args[0]]??args[0];
            return text.replace(/\{(\w+)\}/g,(match,k)=>args[1]?.[k]??match);
          }
          const factory=variables.get(name);
          if(factory?.type!=="ArrowFunctionExpression"||factory.body.type!=="ObjectExpression") return unknown;
          const local={...scope};
          factory.params.forEach((p,i)=>{if(p.type==="Identifier") local[p.name]=args[i];});
          return read(factory.body,local);
        }
        default:return unknown;
      }
    }
    return {nodes,variables,read,property};
  }

  function extract(input,base){
    const dictionary=source(input.translation,{});
    const translationNode=dictionary.nodes.find((n)=>n.type==="ObjectExpression"&&n.properties.length>1000);
    const translations=dictionary.read(translationNode);
    if(!translations||translations===unknown) throw Error("Traduzioni del client non riconosciute");
    const shared=source(input.shared,translations),game=source(input.game,translations);
    const objects=(s)=>s.nodes.filter((n)=>n.type==="ObjectExpression");
    const records=(s,required)=>objects(s).filter((n)=>required.every((p)=>property(n,p))).map((n)=>s.read(n));
    const partners=records(shared,["id","kit","passive"]);
    const items=records(shared,["key","rarity","desc","mods"]).filter((x)=>typeof x.key==="string"&&Number.isInteger(x.rarity));
    const vitamins=records(shared,["key","stat","per","kind"]);
    const passives=new Map();
    const ultimates=new Map();
    for(const object of objects(game)){
      for(const p of object.properties){
        if(p.type!=="Property"||p.value.type!=="ObjectExpression") continue;
        if(property(p.value,"name")&&property(p.value,"desc")) passives.set(String(key(p.key)),game.read(p.value));
        if(property(p.value,"names")&&property(p.value,"descs")) ultimates.set(Number(key(p.key)),game.read(p.value));
      }
    }
    for(const node of game.nodes){
      if(node.type!=="AssignmentExpression"||node.left.type!=="MemberExpression"||!node.left.computed) continue;
      if(property(node.right,"names")&&property(node.right,"descs")){
        const id=game.read(node.left.property);
        if(Number.isInteger(id)) ultimates.set(id,game.read(node.right));
      }
    }
    const fusions=new Map();
    for(const n of game.nodes){
      if(n.type!=="CallExpression"&&!(n.type==="ObjectExpression"&&property(n,"kind")&&property(n,"key"))) continue;
      const value=game.read(n);
      if(value!==unknown&&typeof value?.key==="string"&&value.key.startsWith("fu-")&&value.name&&value.kind) fusions.set(value.key,value);
    }
    const overrides=objects(game).find((n)=>property(n,"vine-whip")&&game.read(property(n,"vine-whip"))==="strike");
    const shapes=game.read(overrides);
    const presetsNode=objects(game).find((n)=>property(n,"strike")&&property(property(n,"strike"),"dmg")&&property(n,"beam"));
    const presets=game.read(presetsNode);
    const specialNode=objects(game).find((n)=>property(n,"fairy-wind")&&property(property(n,"fairy-wind"),"status"));
    const special=game.read(specialNode);
    if(partners.length<130||items.length<100||vitamins.length<20||fusions.size<150||shapes===unknown||presets===unknown) throw Error("Il formato del client è cambiato. Conservo il catalogo precedente.");

    const oldPokemon=new Map(base.pokemon.map((p)=>[p.id,p]));
    const oldMoves=base.moves;
    const language=input.locale;
    const moves={};
    for(const m of input.moves){
      const previous=oldMoves[m.key];
      const shape=shapes[m.key]??previous?.shape;
      if(!shape) continue;
      const preset=presets[shape]??{};
      const sp=special[m.key]??{};
      const power=m.power??70;
      const dmg=(preset.dmg??1)*clamp(.72+power/260,.85,1.3)*(sp.dmgMul??1);
      const cooldown=(preset.cd??2)*clamp(.88+(power-60)/500,.85,1.15)*(m.priority>0?.85:1);
      moves[m.key]={name:language.moves[m.id]??m.name,type:m.type,cls:m.cls,shape,
        status:sp.status??m.ailment??previous?.status??null,power,dmg,cooldown,
        hits:sp.count??preset.count??1,area:preset.area??1,drain:m.drain??0};
    }
    const species=new Map(input.pokemon.filter((p)=>p.id<=251).map((p)=>[p.id,p]));
    const catalogue=[...species.values()].map((p)=>({id:p.id,key:p.key,name:language.pokemon[p.id]??p.name,gen:p.gen,types:p.types,stats:p.stats,partner:oldPokemon.get(p.id)?.partner??p.id}));
    const byId=new Map(catalogue.map((p)=>[p.id,p]));
    const partnerIds=new Set(partners.map((entry)=>entry.id));
    const formsOf=(id,seen=new Set())=>{
      if(seen.has(id)) return [];
      seen.add(id);
      const children=[...species.values()].filter((p)=>p.evoFrom===id&&!partnerIds.has(p.id));
      return [id,...children.flatMap((p)=>formsOf(p.id,seen))];
    };
    for(const entry of partners){
      const p=byId.get(entry.id),old=oldPokemon.get(entry.id)?.league;
      if(!p||!entry.kit.every((k)=>moves[k])) throw Error("Kit incompleto per "+entry.id);
      const passive=passives.get(entry.passive);
      if(!passive?.name||!passive.desc) throw Error("Passiva non riconosciuta per "+p.name);
      const signature=[...fusions.values()].find((f)=>f.member===p.id);
      if(!signature?.moves?.length||!signature.moves.every((k)=>moves[k])) throw Error("Fusione mancante per "+p.name);
      const ultimate=ultimates.get(p.id);
      if(!ultimate?.names?.length) throw Error("Ultimate non riconosciuta per "+p.name);
      p.partner=p.id;
      p.league={...old,kit:entry.kit,forms:formsOf(p.id),passive:passive.name,passiveEffect:passive.desc,
        passiveMods:passive.mods??[],damageTaken:passive.dmgTaken??1,ultimate:ultimate?.names?.join(" → ")??old?.ultimate??"Vedi il client",
        unlock:Array.isArray(entry.challenge)?entry.challenge.map((challenge)=>challenge.desc).join(" · "):entry.challenge?.desc??"Vedi la Lega",tier:old?.tier??"B"};
      for(const id of p.league.forms) byId.get(id).partner=p.id;
    }
    const statName=(stat)=>({physical:"physical damage",special:"special damage",maxHp:"max HP",shieldMax:"shield",moveSpeed:"speed",attackSpeed:"attack speed",critChance:"crit",projSpeed:"projectile speed",statusChance:"status chance",xpGain:"experience",gold:"PokéDollars",luck:"luck",regen:"regen",armor:"armor",area:"area",duration:"duration",lifesteal:"lifesteal",evasion:"evasion",projectiles:"projectiles",thorns:"thorns",pickupRange:"pickup range",overheal:"overheal",powerup:"power-ups",eliteSpawn:"elite spawn rate",difficulty:"difficulty",healing:"healing",statusDamage:"status damage",eliteDamage:"damage to elites and bosses",superEffective:"super effective damage"}[stat]??stat);
    const effect=(v)=>{
      if(v.dice) return translations["Aumenta una estadística al azar"]??"Random vitamin bonus, 50% stronger than the corresponding vitamin.";
      const percent=v.kind==="mul"||["critChance","evasion","lifesteal","overheal"].includes(v.stat);
      return "+"+Number((v.per*(percent?100:1)).toFixed(3))+(percent?"%":"")+" "+statName(v.stat)+" per livello comune.";
    };
    const aliases={moves:{},items:{},vitamins:{},fusions:{},vitIcons:{}};
    for(const m of input.moves) if(moves[m.key]) aliases.moves[m.key]=m.name;
    const spanish=source(input.shared,{});
    for(const node of spanish.nodes.filter((n)=>n.type==="ObjectExpression"&&property(n,"key")&&property(n,"stat")&&property(n,"per"))){
      // Spanish names are also present in the old aliases if translations are unavailable.
      const nameNode=property(node,"name");
      const literal=nameNode?.arguments?.[0]?.quasis?.[0]?.value.cooked;
      const k=spanish.read(property(node,"key"));
      if(typeof k==="string"&&literal) aliases.vitamins[k]=literal;
    }
    for(const v of vitamins) aliases.vitIcons[v.key]=v.icon;
    for(const i of items) aliases.items[i.key]=input.items[i.key]?.name??i.key;
    const spanishGame=source(input.game,{});
    for(const n of spanishGame.nodes){
      if(n.type!=="CallExpression"&&!(n.type==="ObjectExpression"&&property(n,"kind")&&property(n,"key"))) continue;
      const f=spanishGame.read(n);
      if(f!==unknown&&typeof f?.key==="string"&&f.key.startsWith("fu-")&&f.name) aliases.fusions[f.key]=f.name;
    }
    for(const n of objects(game).filter((n)=>property(n,"kind")&&property(n,"key")&&property(n,"name"))){
      const k=game.read(property(n,"key"));
      const name=property(n,"name")?.arguments?.[0]?.quasis?.[0]?.value.cooked;
      if(typeof k==="string"&&name) aliases.fusions[k]=name;
    }
    const data={...base,version:input.version.version,pokemon:catalogue,moves,
      items:items.map((i)=>({key:i.key,name:language.items[i.key]?.name??base.items.find((x)=>x.key===i.key)?.name??i.key,rarity:i.rarity,effect:i.desc,max:i.max??10,mods:i.mods})),
      vitamins:vitamins.map((v)=>({key:v.key,name:v.name,effect:effect(v),stat:v.stat,per:v.per,mods:v.extra??[]})),
      fusions:[...fusions.values()].map((f)=>({key:f.key,member:f.member,kind:f.kind,name:f.name,moves:f.moves??[],types:[...new Set([f.type,f.type2].filter(Boolean))],cls:f.cls,pair:f.pair,limited:false,description:f.desc,cooldown:f.cd,hits:f.hits,power:f.power}))};
    data.rankingReference=base.rankingReference;
    const ranking=rank(data);
    return {schema:1,data,aliases,tiers:ranking,meta:{checkedAt:input.checkedAt??new Date().toISOString(),gameVersion:data.version,gameBuild:input.version.build,rankingReferenceVersion:"0.9.26",rankingMethod:"baseline-and-balance-v1",rankingKind:"estimate",source:origin}};
  }

  // A reproducible estimate for Classic. Values measure damage, control, recovery and setup.
  function rank(data){
    const signatures=new Map(data.fusions.filter((f)=>f.member).map((f)=>[f.member,f]));
    const metric=(move)=>{
      const damage=move.cls!=="status"?Math.log1p((move.dmg??20)*Math.sqrt(move.hits??1)/Math.max(.3,move.cooldown??2)):0;
      const coverage=["nova","spin","wave","vortex","cone","orbit","barrage","aura"].includes(move.shape)?.9:.3;
      const control=["sleep","freeze","paralysis","root","confusion","stun"].includes(move.status)?.8:0;
      return damage+coverage+control+(move.shape==="drain"?1:0);
    };
    const scores=data.pokemon.filter((p)=>p.league).map((p)=>{
      const kit=p.league.kit.map((k)=>data.moves[k]);
      const mods=p.league.passiveMods??[];
      let passive=0;
      for(const mod of mods){
        const value=mod.mul!=null?(mod.mul-1)*10:(mod.add??0);
        const weight={damage:1.5,physical:1,special:1,maxHp:.025,regen:1,armor:.08,evasion:10,shieldMax:.04,moveSpeed:1.5,attackSpeed:1.5,projectiles:.9,lifesteal:12,xpGain:.8,area:.7,luck:.02,critChance:6,healing:.8}[mod.stat]??.15;
        passive+=value*weight;
      }
      passive+=(1-(p.league.damageTaken??1))*7;
      const fusion=signatures.get(p.id);
      const payoff=Math.log1p((fusion?.hits??1)/Math.max(.5,fusion?.cooldown??3));
      const offence=kit.reduce((sum,m)=>sum+metric(m),0)/kit.length;
      const opening=metric(kit[0]);
      const bulk=(p.stats.hp+p.stats.def+p.stats.spd)/150;
      return {key:p.key,score:Number((offence*1.5+opening*.65+clamp(passive,-5,8)+payoff+bulk).toFixed(4))};
    });
    const reference=data.rankingReference;
    if(!reference?.tiers) throw Error("Riferimento della classifica mancante");
    if(!reference.metrics) reference.metrics=Object.fromEntries(scores.map((entry)=>[entry.key,entry.score]));
    const baseline=reference.tiers.flatMap(([,keys])=>keys);
    const adjusted=scores.map((entry)=>{
      const previous=reference.metrics[entry.key]??entry.score;
      const position=baseline.indexOf(entry.key);
      const anchor=position<0?50:100-position*100/baseline.length;
      return {...entry,adjusted:anchor+(entry.score-previous)*5};
    }).sort((a,b)=>b.adjusted-a.adjusted||b.score-a.score||a.key.localeCompare(b.key));
    let offset=0;
    return reference.tiers.map(([tier,keys],i)=>{
      const count=i===reference.tiers.length-1?adjusted.length-offset:Math.min(keys.length,adjusted.length-offset);
      const result=[tier,adjusted.slice(offset,offset+count).map((entry)=>entry.key)];
      offset+=count;
      return result;
    });
  }

  async function fetchInput(fetcher=fetch){
    const get=async(url,json=false)=>{
      const response=await fetcher(url,{cache:"no-store",signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw Error("HTTP "+response.status);
      return json?response.json():response.text();
    };
    const version=await get(origin+"/version.json",true);
    const html=await get(origin+"/?lang=en");
    const entry=html.match(/src=["'](\.?\/?assets\/main-[^"']+\.js)["']/)?.[1];
    if(!entry) throw Error("Client del gioco non riconosciuto");
    if(!entry.includes(version.build)) throw Error("Versione del sito e del client non allineate");
    const entryCode=await get(new URL(entry,origin+"/").href);
    const files=[...entryCode.matchAll(/\.\/((menus|defineProperty|en)-[^"`]+\.js)/g)];
    const file=(prefix)=>files.find((m)=>m[2]===prefix)?.[1];
    if(!file("menus")||!file("defineProperty")||!file("en")) throw Error("Risorse del client non riconosciute");
    const [game,shared,translation,pokemon,moves,items,locale]=await Promise.all([
      get(origin+"/assets/"+file("menus")),get(origin+"/assets/"+file("defineProperty")),get(origin+"/assets/"+file("en")),
      ...["pokemon","moves","items","i18n/en"].map((name)=>get(origin+"/data/"+name+".json?v="+encodeURIComponent(version.build),true))
    ]);
    const after=await get(origin+"/version.json",true);
    if(after.build!==version.build) throw Error("Aggiornamento del gioco in corso");
    return {version,game,shared,translation,pokemon,moves,items,locale};
  }
  const api={extract,rank,fetchInput};
  if(typeof module==="object") module.exports=api;
  else root.BONK_CATALOG=api;
})(globalThis);
