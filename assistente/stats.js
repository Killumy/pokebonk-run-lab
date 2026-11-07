"use strict";

window.BONK_ASSIST_STATS=(()=>{
  const fold=(value)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  // Approximate value of a common blessing, used to compare different units.
  const stats={
    damage:[12,"damage|danno generale|daño"],
    physical:[18,"physical damage|danno fisico|daño físico"],
    special:[18,"special damage|danno speciale|daño especial"],
    attackSpeed:[10,"attack speed|atk. speed|velocità di attacco|velocidad de ataque|vel. de ataque"],
    maxHp:[20,"max hp|maximum hp|ps massimi|ps máx."],
    moveSpeed:[8,"speed|move speed|movement speed|velocità di movimento|velocidad"],
    critChance:[6,"crit|critical|crit chance|probabilità di critico|crítico|prob. crítico"],
    critDamage:[20,"crit damage|critical damage|daño crítico"],
    area:[12,"area|área"],
    xp:[15,"experience|xp|exp|esperienza|experiencia"],
    regen:[.8,"regen|regen/s|regeneration|regeneration/s|rigenerazione|regeneración|regeneración/s"],
    armor:[8,"armor|armour|armatura|armadura"],
    luck:[15,"luck|fortuna|suerte"],
    duration:[20,"duration|move and status duration|duración"],
    statusChance:[20,"status chance|status effect chance|probabilità di infliggere stati|probabilidad de estados|prob. de estado"],
    statusDamage:[15,"status damage|danno da bruciatura e veleno|daño de estado|daño de estados"],
    projectiles:[1,"projectile|projectiles|projectile count|proyectil|proyectiles"],
    projSpeed:[15,"projectile speed|proj. speed|velocità dei proiettili|velocidad de proyectil|vel. proyectil"],
    shield:[12,"shield|scudo rigenerabile|escudo"],
    lifesteal:[2,"lifesteal|life steal|furto di vita|robo de vida"],
    thorns:[10,"thorns|spine|espinas"],
    evasion:[3,"evasion|dodge chance|evasión"],
    pickup:[2,"pickup|pickup range|raggio di raccolta|al raggio di raccolta|rango de recogida|rango recogida|recogida"],
    eliteDamage:[12,"elite damage|damage to elites|damage to elites and bosses|damage vs elites and bosses|damage to elites, alphas and bosses|daño a élites y jefes|daño a élites"],
    gold:[20,"pokédollars|pokédólares|gold"],
    healing:[15,"healing|curación"],
    superEffective:[15,"super-effective damage|super effective damage|daño muy eficaz"],
    extraJumps:[1,"extra jump|extra jumps|saltos extra"],
    jumpHeight:[15,"jump height|altura salto"],
    knockback:[20,"knockback|retroceso"],
    bounces:[1,"bounces|rebotes"],
    overheal:[5,"overheal|sovracura|sobrecuración"],
    flinch:[5,"flinch chance|prob. retroceder"],
    megaCrit:[5,"mega crit chance|prob. megacrítico"],
    powerup:[15,"power-ups|power-up"],
    difficulty:[12,"difficulty|intensità della run|dificultad"],
    enemyAmount:[12,"enemy count|enemy amount|cantidad enemigos"],
    eliteSpawn:[18,"elite spawn|elite spawn rate|elite spawns|frequenza degli élite|aparición de élites"],
    slam:[15,"slam damage|daño de caída"]
  };
  const names=new Map(Object.entries(stats).flatMap(([stat,[,labels]])=>labels.split("|").map((name)=>[fold(name).replace(/\.$/,""),stat])));
  const projectileShapes=new Set(["bolt","barrage","homing","boomerang","orb"]);
  const areaShapes=new Set(["nova","spin","cone","wave","vortex","trap","lob","orbit","aura"]);
  const durationShapes=new Set(["spin","vortex","trap","orbit","aura","beam"]);

  function parse(value){
    const match=fold(value).match(/^([+−-])(\d+(?:[.,]\d+)?)\s*(%?)\s+(.+?)\.?$/);
    if(!match) return null;
    const stat=names.get(match[4]);
    if(!stat) return null;
    return {stat,amount:Number(match[2].replace(",","."))*(match[1]==="+"?1:-1),percent:!!match[3]};
  }
  function weights(plan,run,mode,equipped){
    const active=equipped.length?equipped:plan.kit.slice(0,1);
    const damage=active.filter((move)=>move.cls!=="status");
    const early=run.stage<3&&run.level<25;
    const defensive=run.health==="low"?2.4:run.health==="mid"?1.45:mode==="survival"?1.35:1;
    const affinity=(cls)=>damage.some((move)=>move.cls===cls)||plan.priority.cls===cls||plan.fusion.cls===cls;
    const hasShape=(shapes)=>active.some((move)=>shapes.has(move.shape))||shapes.has(plan.priority.shape);
    const control=active.some((move)=>move.status);
    return {
      damage:1.15,physical:affinity("physical") ? 1.15 : 0,special:affinity("special") ? 1.15 : 0,
      attackSpeed:1.12,maxHp:.67*defensive,moveSpeed:.85*defensive,critChance:.7,critDamage:.35,
      area:hasShape(areaShapes)?1.04:.72,xp:early?(mode==="boss"?1.05:1.8)/defensive:.55/defensive,
      regen:(active.some((move)=>move.shape==="drain") ? .68 : .85)*defensive,armor:.92*defensive,luck:early ? .85 : .55,
      duration:(hasShape(durationShapes)||control) ? .8 : .25,statusChance:control ? .85 : .25,
      statusDamage:active.some((move)=>["burn","poison"].includes(move.status))?1.05:0,
      projectiles:hasShape(projectileShapes)?1.45:0,projSpeed:hasShape(projectileShapes) ? .55 : 0,
      shield:.82*defensive,lifesteal:.97*defensive,thorns:.22*defensive,evasion:.78*defensive,
      pickup:early ? .55 : .3,eliteDamage:mode==="boss"?1.4:.85,gold:early ? .58 : .35,healing:.5*defensive,
      superEffective:.75,extraJumps:.5,jumpHeight:.2,knockback:.36,bounces:hasShape(projectileShapes) ? .8 : 0,
      overheal:.43*defensive,flinch:.58,megaCrit:.2,powerup:.5,difficulty:-1.4,enemyAmount:-.7,
      eliteSpawn:-.5,slam:.25
    };
  }
  function score(mod,values){
    if(!mod) return 0;
    const unit=mod.percent&&["armor","maxHp","regen","shield"].includes(mod.stat)?15:stats[mod.stat][0];
    return mod.amount/unit*values[mod.stat];
  }
  function explain(mod,run){
    if(mod.stat==="xp"&&run.stage<3&&run.level<25) return "Più esperienza per completare il kit prima.";
    if(run.health!=="normal"&&["armor","regen","evasion","maxHp","shield","lifesteal","healing"].includes(mod.stat)) return "I PS sono bassi. Dai priorità alla sopravvivenza.";
    if(["damage","physical","special","attackSpeed","projectiles","statusChance","statusDamage"].includes(mod.stat)) return "Potenzia gli attacchi della tua build.";
    return "Il bonus più utile tra quelli offerti per la tua run.";
  }
  return {fold,parse,weights,score,explain};
})();
