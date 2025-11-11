/**
 * Sistema de Audio con WebAudio API.
 * Maneja carga de buffers, loops de menú/juego y efectos (llaves, salida,
 * victoria/derrota) además de ambient aleatorio y disparadores por proximidad.
 */
export const Audio = {
  ctx: null,
  master: null,
  initialized: false,
  buffers: {},
  currentGameLoop: null,
  zombieAmbientTimer: 0,
  nextZombieAmbient: 0,
  lastProximityPlay: 0,
  proximityThreshold: 0.78,
  loadPromises: [],
  init(){
    if(this.initialized) return;
    try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
    this.master=this.ctx.createGain(); this.master.gain.value=1; this.master.connect(this.ctx.destination);
    this.initialized=true;
    const files={
      begin:'assets/audio/begin.mp3', game:'assets/audio/game.mp3', keys:'assets/audio/keys.mp3', appearExit:'assets/audio/appearExit.mp3', openExit:'assets/audio/openExit.mp3', win:'assets/audio/win.mp3', lose:'assets/audio/lose.mp3'
    };
    for(const [k,url] of Object.entries(files)) this.loadAudio(k,url);
    ['ambienceZombie1','ambienceZombie2','apZombie1','apZombie2','apZombie3'].forEach(name=>{
      const url=`assets/audio/${name}.mp3`; this.loadAudio(name,url);
    });
  },
  loadAudio(name,url){
    const p=fetch(url).then(r=>r.arrayBuffer()).then(b=>this.ctx.decodeAudioData(b)).then(buf=>{ this.buffers[name]=buf; }).catch(()=>{});
    this.loadPromises.push(p);
  },
  ready(){ return Promise.all(this.loadPromises); },
  play(name,{loop=false,volume=1,fadeIn=0,stopOthers=false}={}){
    if(!this.initialized||!this.buffers[name]) return null;
    if(stopOthers) this.stop(['game','begin']);
    const src=this.ctx.createBufferSource(); src.buffer=this.buffers[name]; src.loop=loop;
    const g=this.ctx.createGain(); g.gain.value=0; src.connect(g); g.connect(this.master); src.start();
    if(fadeIn>0){ const now=this.ctx.currentTime; g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(volume,now+fadeIn/1000); } else g.gain.value=volume;
    src._gainNode=g;
    return src;
  },
  fadeOut(src,ms=600){ if(!src||!src._gainNode) return; const g=src._gainNode; const now=this.ctx.currentTime; g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value,now); g.gain.linearRampToValueAtTime(0,now+ms/1000); setTimeout(()=>{ try{src.stop();}catch(_){ } }, ms+50); },
  stop(names){ names.forEach(n=>{ if(this[n] && this[n].stop){ try{this[n].stop();}catch(_){ } } }); },
  playMenuAmbient(){ 
      this.ensureInit(); 
      this.stopGameLoop(); 
      this.stopSpecials(); 
      if(this.begin){ 
          this.fadeOut(this.begin,400); 
      } 
      setTimeout(()=>{ 
          if(this.buffers.begin) {
              this.begin=this.play('begin',{loop:true,volume:0.85,fadeIn:600,stopOthers:true}); 
          }
      }, 150); 
  },
  playGameAmbient(){ this.ensureInit(); this.stopMenu(); this.stopSpecials(); this.stopGameLoop(); this.gameLoop=this.play('game',{loop:true,volume:0.32,fadeIn:900}); },
  stopGameLoop(){ if(this.gameLoop){ this.fadeOut(this.gameLoop,800); this.gameLoop=null; } },
  stopMenu(){ if(this.begin){ this.fadeOut(this.begin,600); this.begin=null; } },
  playKeyPickup(){ 
      this.ensureInit(); 
      if(this.buffers.keys) {
          this.play('keys',{volume:0.85}); 
      }
  },
  playDoorSpawn(){ this.ensureInit(); this.appearExitNode=this.play('appearExit',{volume:0.85}); },
  playExitOpen(){ this.ensureInit(); this.stopGameLoop(); this.openExitNode=this.play('openExit',{volume:1}); },
  playVictory(){ this.ensureInit(); this.stopGameLoop(); this.winNode=this.play('win',{volume:1}); },
  playDefeat(){ this.ensureInit(); this.stopGameLoop(); this.loseNode=this.play('lose',{volume:1}); },
  // Zombie ambient aleatorio
  updateZombieAmbient(dt){ if(!this.initialized) return; this.zombieAmbientTimer+=dt; if(this.zombieAmbientTimer>=this.nextZombieAmbient){
      if(Math.random()<0.6){ const clips=['ambienceZombie1','ambienceZombie2']; const choice=this.pickLoaded(clips); if(choice){ this.play(choice,{volume:0.45}); } }
      this.nextZombieAmbient=this.zombieAmbientTimer + (10+Math.random()*14); // siguiente entre 10..24s
    } },
  // Proximidad extrema zombie (apZombie*)
  playProximityIfNeeded(f){ if(!this.initialized) return; const now=performance.now?performance.now():Date.now(); if(f<this.proximityThreshold) return; if(now - this.lastProximityPlay < 5000) return; if(Math.random()<0.55) return; const clips=['apZombie1','apZombie2','apZombie3']; const choice=this.pickLoaded(clips); if(choice){ this.play(choice,{volume:0.8}); this.lastProximityPlay=now; } },
  setThreatProximity(f){ this.playProximityIfNeeded(f); },
  stopSpecials(){ ['winNode','loseNode','openExitNode','appearExitNode'].forEach(n=>{ if(this[n]){ this.fadeOut(this[n],400); this[n]=null; } }); },
  resetGame(){ this.zombieAmbientTimer=0; this.nextZombieAmbient=0; this.lastProximityPlay=0; this.stopSpecials(); },
  ensureInit(){ if(!this.initialized) this.init(); },
  pickLoaded(arr){ const loaded=arr.filter(n=>this.buffers[n]); if(!loaded.length) return null; return loaded[Math.floor(Math.random()*loaded.length)]; }
};
