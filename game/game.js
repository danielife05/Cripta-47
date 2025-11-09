import { Input } from './input.js';
import { GAME_CONSTANTS, LEVELS, COLORS, MAP } from './level_data.js';
import { Player, Enemy } from './units.js';
import { Audio } from './audio.js';

// Objeto principal del juego (limpio y unificado)
window.Game = {
  canvas: null, ctx: null,
  cameraX: 0, cameraY: 0,
  currentState: 'MENU',
  player: null,
  enemies: [], bullets: [], splats: [],
  keys: [], exit: null,
  score: 0,
  threatLevel: 1,
  spawnTimer: 0,
  spawnInterval: GAME_CONSTANTS.WAVES.INITIAL_SPAWN_INTERVAL,
  gameTime: 0,
  enemyScale: 1,
  maxEnemies: 60,
  lastEscalationMinute: 0,
  lastAlerts: {}, alertCooldownMs: 2500,
  exitSpawned: false,
    assets: {},
    spriteOffsets: { soldier: Math.PI, zombie: 0 },

  // Inicialización
  init(id='game') {
    this.canvas = document.getElementById(id);
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
    this.canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;
    Input.init(this.canvas, this.ctx);
    this.level = LEVELS[0];
        this.loadAssets(() => { 
            this.createProceduralPatterns(); 
            this.initUIManager(); 
            Audio.init(); 
            this.setState('MENU'); 
            setTimeout(()=>{ 
                try{ Audio.playMenuAmbient(); }catch(_){} 
            }, 200);
        });
  },

    loadAssets(done){
        const manifest = { soldier: 'assets/img/soldier.svg', zombie: 'assets/img/zombie.svg', exit: 'assets/img/exit.svg', key1: 'assets/img/key1.svg', key2: 'assets/img/key2.svg', key3: 'assets/img/key3.svg' };
        let pending = Object.keys(manifest).length; 
        const finish=()=>{ if(--pending<=0 && done) done(); };
        for(const [name,url] of Object.entries(manifest)){
            const img=new Image(); 
            img.onload=finish; 
            img.onerror=finish; 
            img.src=url; 
            this.assets[name]=img; 
        }
    },

  // Botones UI
    initUIManager(){ 
        const bind=(id,fn)=>{ 
            const el=document.getElementById(id); 
            if(el && !el.dataset.bound){ 
                el.dataset.bound='1'; 
                el.addEventListener('click',e=>{
                    e.preventDefault(); 
                    try{Audio.init();}catch(_){} 
                    fn();
                }); 
            } 
        }; 
        bind('start-button',()=>this.startGame()); 
        bind('restart-button',()=>{ location.reload(); }); 
    },

  // Cambio estado
    setState(st){ 
        this.currentState=st; 
        const menu=document.getElementById('menu-screen'); 
        const hud=document.getElementById('hud'); 
        const over=document.getElementById('gameover-screen'); 
        const container=document.getElementById('game-container'); 
        const canvas=this.canvas; 
        [menu,hud,over].forEach(el=>{ if(el){ el.classList.add('hidden'); el.classList.remove('visible'); }}); 
        switch(st){ 
            case 'MENU': 
                if(menu){ menu.classList.remove('hidden'); menu.classList.add('visible'); } 
                if(canvas) canvas.style.pointerEvents='none'; 
                if(container) container.style.pointerEvents='auto'; 
                break; 
            case 'GAME': 
                if(hud){ hud.classList.remove('hidden'); hud.style.display='block'; } 
                if(canvas) canvas.style.pointerEvents='auto'; 
                if(container) container.style.pointerEvents='none'; 
                try{ Audio.stopMenu(); Audio.playGameAmbient(); }catch(_){} 
                break; 
            case 'GAMEOVER': 
                if(over){ over.classList.remove('hidden'); over.classList.add('visible'); } 
                if(canvas) canvas.style.pointerEvents='none'; 
                if(container) container.style.pointerEvents='auto'; 
                try{ Audio.stopGameLoop(); Audio.playDefeat(); }catch(_){} 
                break;
            case 'VICTORY': 
                if(over){ over.classList.remove('hidden'); over.classList.add('visible'); } 
                if(canvas) canvas.style.pointerEvents='none'; 
                if(container) container.style.pointerEvents='auto'; 
                try{ Audio.stopGameLoop(); Audio.playVictory(); }catch(_){} 
                break; 
        } 
    },

  // Nueva partida
    startGame(){ this.player=new Player(120,120); this.enemies=[]; this.bullets=[]; this.splats=[]; this.score=0; this.threatLevel=1; this.spawnTimer=0; this.spawnInterval=GAME_CONSTANTS.WAVES.INITIAL_SPAWN_INTERVAL; this.gameTime=0; this.enemyScale=1; this.exitSpawned=false; this.exit=null; this.lastEscalationMinute=0; this.walls=this.generateMazeWallsSeeded('SEMILLA'); const start=this.getMazeStartPosition(); if(start){ this.player.x=start.x; this.player.y=start.y; } this.keys=this.spawnRandomKeys(3); this.ambientDecals=[]; this.generateAmbientBloodDecals(120); this.updateCamera(); this.spawnBurst(4,650,900); try{ Audio.resetGame && Audio.resetGame(); }catch(_){} this.setState('GAME'); },

    // Lógica frame (refactor con colisión bala-pared y audio de amenaza)
        update(dt){
                if(this.currentState!=='GAME' || !this.player) return;
                if(!this.walls || !this.walls.length) this.walls=this.generateMazeWallsSeeded('SEMILLA');
                this.gameTime+=dt;
                const elapsedMin=Math.floor(this.gameTime/60);
                if(elapsedMin!==this.lastEscalationMinute){
                        this.lastEscalationMinute=elapsedMin; this.threatLevel=elapsedMin+1;
                        this.spawnInterval=Math.max(1.2,this.spawnInterval*0.95);
                        this.enemyScale=Math.min(1.8,this.enemyScale*1.06);
                        if(elapsedMin>0){ this.spawnDifficultyAlertOnce('¡ADVERTENCIA! ¡La horda se está volviendo más rápida!'); this.spawnBurst(3,700,1100); }
                }
                const remaining=Math.max(0,GAME_CONSTANTS.MAX_GAME_TIME - this.gameTime);
                if(remaining<=0){ this.setGameOver('Tiempo agotado'); return; }
                this.spawnTimer+=dt;
                if(this.spawnTimer>=this.spawnInterval){
                        this.spawnTimer=0; let batch=Math.min(3,1+Math.floor(this.threatLevel/3));
                        batch=Math.min(batch,Math.max(0,this.maxEnemies - this.enemies.length));
                        for(let i=0;i<batch;i++) this.spawnEnemy();
                }
                this.player.update(dt, Input, this.bullets, {x:this.cameraX,y:this.cameraY});
                this.resolveEntityVsWalls(this.player,12);
                this.updateCamera();
                this.enemies.forEach(e=>{ const lit=this.isPointInLight(e.x,e.y); e.update(dt,this.player,lit,this.enemyScale); this.resolveEntityVsWalls(e,e.r); });
                this.bullets.forEach(b=>b.update(dt));
                // Colisión balas vs paredes
                for(const b of this.bullets){ if(this.bulletHitsAnyWall(b)) b.life=0; }
                this.bullets=this.bullets.filter(b=>b.life>0);
                // Colisión balas vs enemigos
                for(const e of this.enemies){ if(e.state!=='alive') continue; if(!this.isPointInLight(e.x,e.y)) continue; for(const b of this.bullets){ if(this.lineHitsCircle(b,e)){ e.hp-=b.damage; b.life=0; if(e.hp<=0){ e.kill(); this.score+=10; this.addSplat(e.x,e.y); } } } }
                // limpiar muertos
                this.enemies=this.enemies.filter(e=> e.state!=='dead');
                // Sonido amenaza / proximidad (apZombie*) + ambiente zombi aleatorio
                try{ let nearest=Infinity; for(const e of this.enemies){ if(e.state!=='alive') continue; const d=Math.hypot(e.x-this.player.x,e.y-this.player.y); if(d<nearest) nearest=d; } if(nearest<Infinity){ const RANGE=900; const f=Math.max(0,Math.min(1,1 - nearest/RANGE)); Audio.setThreatProximity(f); Audio.updateZombieAmbient(dt); } else { Audio.setThreatProximity(0); Audio.updateZombieAmbient(dt); } }catch(_){ }
                // contacto cuerpo a cuerpo
                let touching=false; for(const e of this.enemies){ if(e.state!=='alive') continue; if(Math.hypot(e.x - this.player.x, e.y - this.player.y) < e.r+10){ touching=true; break; } }
                this.contactTimer=touching ? (this.contactTimer||0)+dt : 0; const HIT_PERIOD=0.4; while(this.contactTimer>=HIT_PERIOD){ this.contactTimer-=HIT_PERIOD; this.damagePlayer(1); if(this.currentState!=='GAME') break; }
                // captura de llaves
                const KEY_R=26, CAP_RATE=0.9; for(const k of this.keys){ if(k.collected) continue; k.capturing=false; const d=Math.hypot(k.x-this.player.x,k.y-this.player.y); if(d<KEY_R){ const sp=Math.hypot(this.player.vx,this.player.vy); const f= sp<25?1:0.4; k.progress+=CAP_RATE*f*dt; k.capturing=true; if(k.progress>=1){ k.progress=1; k.collected=true; this.player.keys=(this.player.keys||0)+1; try{Audio.playKeyPickup();}catch(_){ } this.spawnInterval=Math.max(0.75,this.spawnInterval*0.85); this.enemyScale=Math.min(2.0,this.enemyScale*1.08); this.spawnDifficultyAlertOnce('Llave capturada'); this.spawnBurst(Math.min(4,2+this.player.keys),650,1000);} } else if(k.progress>0) k.progress=Math.max(0,k.progress-0.25*dt); }
                // spawn salida
                if(!this.exitSpawned && this.player.keys>=3){ const ex=this.spawnRandomExit(); if(ex){ this.exit={...ex,progress:0,capturing:false,required:1}; this.exitSpawned=true; this.spawnDifficultyAlertOnce('¡SALIDA DISPONIBLE! Busca la puerta de escape.'); try{Audio.playDoorSpawn();}catch(_){ } } }
                if(this.exit){ const RATE=0.18; const inExit=this.rectContainsPoint(this.exit,this.player.x,this.player.y); this.exit.capturing=false; if(inExit && this.isRectInLight(this.exit)){ const sp=Math.hypot(this.player.vx,this.player.vy); const f= sp<25?1:0.45; this.exit.progress+=RATE*f*dt; this.exit.capturing=true; if(this.exit.progress>=this.exit.required){ this.exit.progress=this.exit.required; // Secuencia: abrir salida (openExit) -> victoria
                    try{Audio.playExitOpen();}catch(_){ }
                    setTimeout(()=>{ this.setVictory(); try{Audio.playVictory();}catch(_){ } }, 900); }
                } else if(this.exit.progress>0) this.exit.progress=Math.max(0,this.exit.progress-0.15*dt); }
                // HUD
                const livesEl=document.getElementById('hud-lives'); if(livesEl) livesEl.textContent=this.player.lives; const keysEl=document.getElementById('hud-keys'); if(keysEl) keysEl.textContent=`${this.player.keys||0}/3`; const timeEl=document.getElementById('hud-time'); if(timeEl){ const m=Math.floor(remaining/60); const s=Math.floor(remaining%60); timeEl.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
        },

  // Cámara
  updateCamera(){ if(!this.player||!this.canvas) return; const halfW=this.canvas.width/2, halfH=this.canvas.height/2; const maxX=Math.max(0,GAME_CONSTANTS.WORLD_WIDTH-this.canvas.width); const maxY=Math.max(0,GAME_CONSTANTS.WORLD_HEIGHT-this.canvas.height); this.cameraX=Math.max(0,Math.min(maxX,this.player.x-halfW)); this.cameraY=Math.max(0,Math.min(maxY,this.player.y-halfH)); },

    // Render (con sprites PNG y corrección de orientación)
        render(ctx){
                if(this.currentState!=='GAME') return;
                ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
            try{ ctx.imageSmoothingEnabled=false; }catch(_){ }
                this.drawTiledFloor(ctx);
                if(this.ambientDecals && this.ambientDecals.length) this.drawAmbientDecals(ctx, (x,y)=> this.isPointInLight(x,y));
                ctx.strokeStyle='#211014'; ctx.lineWidth=1; ctx.globalAlpha=0.10; const gridSize=64; const sx0=Math.floor(this.cameraX/gridSize)*gridSize; const sy0=Math.floor(this.cameraY/gridSize)*gridSize; for(let x=sx0;x<=this.cameraX+this.canvas.width;x+=gridSize){ const sx=x-this.cameraX; ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,this.canvas.height); ctx.stroke(); } for(let y=sy0;y<=this.cameraY+this.canvas.height;y+=gridSize){ const sy=y-this.cameraY; ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(this.canvas.width,sy); ctx.stroke(); } ctx.globalAlpha=1; for(const w of this.getWalls()){ const sx=w.x-this.cameraX, sy=w.y-this.cameraY; if (sx+w.w<0||sy+w.h<0||sx>this.canvas.width||sy>this.canvas.height) continue; if(this.assets.wallPattern){ ctx.save(); ctx.translate(sx,sy); ctx.fillStyle=this.assets.wallPattern; ctx.fillRect(0,0,w.w,w.h); ctx.restore(); } else { ctx.fillStyle='#2a0f12'; ctx.fillRect(sx,sy,w.w,w.h); ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(sx+2,sy+2,w.w-4,w.h-4); } } if(this.splats.length) this.drawSplats(ctx, (x,y)=> this.isPointInLight(x,y)); if(this.exit && this.isRectInLight(this.exit)){ const sx=this.exit.x-this.cameraX, sy=this.exit.y-this.cameraY; const img=this.assets.exit; if(img && img.complete){ ctx.drawImage(img,sx,sy,this.exit.w,this.exit.h); } else { ctx.fillStyle=COLORS.EXIT; ctx.fillRect(sx,sy,this.exit.w,this.exit.h);} } for(let idx=0; idx<this.keys.length; idx++){ const k=this.keys[idx]; const inLight=this.isPointInLight(k.x,k.y); const sx=k.x-this.cameraX, sy=k.y-this.cameraY; const pulse=0.5+Math.sin(Date.now()*0.003)*0.3; if(k.collected){ if(inLight){ const keyImg=this.assets['key'+(idx+1)]; if(keyImg && keyImg.complete){ ctx.drawImage(keyImg,sx-16,sy-16,32,32);} } continue; } if(inLight){ ctx.save(); ctx.globalAlpha=pulse*0.5; ctx.fillStyle='rgba(255,140,0,0.45)'; ctx.beginPath(); ctx.arc(sx,sy,18,0,Math.PI*2); ctx.fill(); ctx.restore(); const keyImg=this.assets['key'+(idx+1)]; if(keyImg && keyImg.complete){ ctx.drawImage(keyImg,sx-16,sy-16,32,32);} else { ctx.fillStyle=COLORS.KEY; ctx.fillRect(sx-6,sy-4,12,8);} } if(k.progress>0){ const prog=Math.min(1,k.progress); ctx.strokeStyle='#fbbf24'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(sx,sy,22,-Math.PI/2,-Math.PI/2+prog*Math.PI*2); ctx.stroke(); if(k.capturing){ ctx.fillStyle='rgba(255,215,0,0.22)'; ctx.beginPath(); ctx.arc(sx,sy,24,0,Math.PI*2); ctx.fill(); } else if(!inLight){ ctx.save(); ctx.globalAlpha=0.18; ctx.fillStyle='rgba(255,180,0,0.25)'; ctx.beginPath(); ctx.arc(sx,sy,20,0,Math.PI*2); ctx.fill(); ctx.restore(); } } }
                // Enemigos: usar SVG si está cargado, sino fallback vectorial
                this.enemies.forEach(e=>{ 
                    if(!this.isPointInLight(e.x,e.y)) return; 
                    const zx=this.assets.zombie; 
                    if(zx && zx.complete && zx.naturalWidth > 0){ 
                        const sx=e.x-this.cameraX, sy=e.y-this.cameraY; 
                        ctx.save(); 
                        ctx.translate(sx,sy); 
                        const rot=(e.angle||0) + (this.spriteOffsets?.zombie||0); 
                        ctx.rotate(rot);
                        // Ajuste de brillo según proximidad al origen de la luz
                        const lf=this.lightFactorAt(e.x,e.y); // 0..1 (más cerca => mayor)
                        // Canvas 2D moderno soporta filter; si no existe hacemos fallback posteriormente
                        if(typeof ctx.filter === 'string'){ ctx.filter=`brightness(${(1 + lf*0.85).toFixed(2)}) contrast(${(1+lf*0.25).toFixed(2)})`; }
                        ctx.globalCompositeOperation='source-over';
                        ctx.drawImage(zx,-24,-24,48,48);
                        // Fallback ligero de brillo (para entornos sin filter) usando overlay aditivo
                        if(!('filter' in ctx)){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=lf*0.35; ctx.fillStyle='rgba(255,190,80,0.85)'; ctx.beginPath(); ctx.arc(0,0,26,0,Math.PI*2); ctx.fill(); }
                        ctx.restore(); 
                    } else { 
                        // Para el modo vectorial aplicamos también el factor de luz
                        const lf=this.lightFactorAt(e.x,e.y);
                        ctx.save();
                        if(typeof ctx.filter === 'string'){ ctx.filter=`brightness(${(1 + lf*0.8).toFixed(2)})`; }
                        e.draw(ctx,{x:this.cameraX,y:this.cameraY});
                        if(!('filter' in ctx)){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=lf*0.3; ctx.fillStyle='rgba(255,180,70,0.7)'; const sx=e.x-this.cameraX, sy=e.y-this.cameraY; ctx.beginPath(); ctx.arc(sx,sy,22,0,Math.PI*2); ctx.fill(); }
                        ctx.restore();
                    } 
                });
                this.bullets.forEach(b=>b.draw(ctx,{x:this.cameraX,y:this.cameraY}));
                this.drawFOV(ctx);
                this.postLightEnhance(ctx);
                // Jugador con corrección de sprite SVG (soldier mira hacia arriba en el SVG)
            const pImg=this.assets.soldier; 
            if(pImg && pImg.complete && pImg.naturalWidth > 0){ 
                const sx=this.player.x-this.cameraX, sy=this.player.y-this.cameraY; 
                ctx.save(); 
                ctx.translate(sx,sy); 
                const rot=this.player.aimAngle + (this.spriteOffsets?.soldier||0); 
                ctx.rotate(rot);
                // Brillo del jugador: siempre máximo en centro de haz
                const lf=this.lightFactorAt(this.player.x,this.player.y);
                if(typeof ctx.filter === 'string'){ ctx.filter=`brightness(${(1.15 + lf*0.6).toFixed(2)}) contrast(${(1+lf*0.2).toFixed(2)})`; }
                ctx.globalCompositeOperation='source-over';
                ctx.drawImage(pImg,-24,-24,48,48);
                if(!('filter' in ctx)){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.30 + lf*0.35; ctx.fillStyle='rgba(255,210,120,0.9)'; ctx.beginPath(); ctx.arc(0,0,26,0,Math.PI*2); ctx.fill(); }
                ctx.restore(); 
            } else { 
                const lf=this.lightFactorAt(this.player.x,this.player.y);
                ctx.save();
                if(typeof ctx.filter === 'string'){ ctx.filter=`brightness(${(1.1 + lf*0.55).toFixed(2)})`; }
                this.player.draw(ctx,{x:this.cameraX,y:this.cameraY});
                if(!('filter' in ctx)){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.25 + lf*0.4; ctx.fillStyle='rgba(255,200,100,0.85)'; const sx=this.player.x-this.cameraX, sy=this.player.y-this.cameraY; ctx.beginPath(); ctx.arc(sx,sy,24,0,Math.PI*2); ctx.fill(); }
                ctx.restore();
            }
                this.drawBulletsOnTop(ctx);
        },

    // Luz (cono) - mejora de visibilidad general
    drawFOV(ctx){ 
        const pxW=this.player.x, pyW=this.player.y; 
        const r=GAME_CONSTANTS.PLAYER.FOV_RADIUS, ang=GAME_CONSTANTS.PLAYER.FOV_ANGLE; 
        const a0=this.player.aimAngle-ang/2; 
        const a1=this.player.aimAngle+ang/2; 
        ctx.save(); 
        ctx.fillStyle='rgba(0,0,0,0.64)'; 
        ctx.fillRect(0,0,this.canvas.width,this.canvas.height); 
        ctx.globalCompositeOperation='destination-out'; 
        const points=this.computeVisibilityCone(pxW,pyW,r,a0,a1); 
        if(points.length) points.unshift({x:pxW,y:pyW}); 
        if(points.length>=2){ 
            const px=pxW-this.cameraX, py=pyW-this.cameraY; 
            const grad=ctx.createRadialGradient(px,py,r*0.05,px,py,r); 
            grad.addColorStop(0,'rgba(255,255,255,1)'); 
            grad.addColorStop(0.3,'rgba(255,255,255,0.9)'); 
            grad.addColorStop(0.7,'rgba(255,255,255,0.5)'); 
            grad.addColorStop(1,'rgba(255,255,255,0)'); 
            ctx.fillStyle=grad; 
            ctx.beginPath(); 
            ctx.moveTo(points[0].x - this.cameraX, points[0].y - this.cameraY); 
            for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x - this.cameraX, points[i].y - this.cameraY); 
            ctx.closePath(); 
            ctx.fill(); 
        } 
        ctx.restore(); 
        ctx.save(); 
        ctx.globalCompositeOperation='source-over'; 
        ctx.fillStyle='rgba(0,0,0,0.60)'; 
        for(const w of this.getWalls()){ 
            const sx=w.x-this.cameraX, sy=w.y-this.cameraY; 
            if (sx+w.w<0||sy+w.h<0||sx>this.canvas.width||sy>this.canvas.height) continue; 
            ctx.fillRect(sx,sy,w.w,w.h);
        } 
        ctx.restore(); 
    },

  // Punto iluminado
  isPointInLight(x,y){ 
      const r=GAME_CONSTANTS.PLAYER.FOV_RADIUS, ang=GAME_CONSTANTS.PLAYER.FOV_ANGLE; 
      const a=Math.atan2(y-this.player.y,x-this.player.x); 
      const da=Math.atan2(Math.sin(a-this.player.aimAngle),Math.cos(a-this.player.aimAngle)); 
      const dist=Math.hypot(x-this.player.x,y-this.player.y); 
      if(Math.abs(da)>ang/2||dist>r) return false; 
      return !this.rayHitsWall(this.player.x,this.player.y,x,y); 
  },

  // Factor luz
  lightFactorAt(x,y){ 
      if(!this.isPointInLight(x,y)) return 0; 
      const r=GAME_CONSTANTS.PLAYER.FOV_RADIUS; 
      let f=1 - (Math.hypot(x-this.player.x,y-this.player.y)/r); 
      return Math.max(0,Math.min(1,Math.pow(f,0.6))); 
  },

  // Origen linterna
        getMuzzlePoint(){
            const offFront=24; 
            const offSide=12;
            const dirx=Math.cos(this.player.aimAngle), diry=Math.sin(this.player.aimAngle);
            const perpX=-Math.sin(this.player.aimAngle), perpY=Math.cos(this.player.aimAngle);
            return { 
                x: this.player.x - dirx*offFront + perpX*offSide, 
                y: this.player.y - diry*offFront + perpY*offSide 
            };
        },

  // Brillos secundarios
    postLightEnhance(ctx){ 
            // Refuerzo de iluminación dentro del cono: añade leve bloom proporcional a la distancia al origen.
            const r=GAME_CONSTANTS.PLAYER.FOV_RADIUS, ang=GAME_CONSTANTS.PLAYER.FOV_ANGLE; 
            const a0=this.player.aimAngle-ang/2; 
            const a1=this.player.aimAngle+ang/2; 
            const pts=this.computeVisibilityCone(this.player.x,this.player.y,r,a0,a1); 
            if(!pts.length) return; 
            const px=this.player.x - this.cameraX, py=this.player.y - this.cameraY; 
            ctx.save(); 
            ctx.globalCompositeOperation='lighter'; 
            // Gradiente cálido
            const g=ctx.createRadialGradient(px,py,r*0.05,px,py,r); 
            g.addColorStop(0,'rgba(255,240,180,0.55)'); 
            g.addColorStop(0.35,'rgba(255,210,120,0.28)'); 
            g.addColorStop(0.65,'rgba(255,170,70,0.10)'); 
            g.addColorStop(1,'rgba(255,150,50,0.0)'); 
            ctx.fillStyle=g; 
            ctx.beginPath(); 
            ctx.moveTo(this.player.x - this.cameraX, this.player.y - this.cameraY); 
            for(const p of pts){ ctx.lineTo(p.x - this.cameraX, p.y - this.cameraY); } 
            ctx.closePath(); 
            ctx.fill(); 
            ctx.restore(); 
    },

  // Rect iluminado
  isRectInLight(r){ if(!r) return false; return this.isPointInLight(r.x + r.w/2, r.y + r.h/2); },

  // Spawn múltiple
  spawnBurst(count,minDist=650,maxDist=1000){ for(let n=0;n<count;n++){ if(this.enemies.length>=this.maxEnemies) break; const ang=Math.random()*Math.PI*2; const dist=minDist+Math.random()*(maxDist-minDist); const x=this.player.x+Math.cos(ang)*dist; const y=this.player.y+Math.sin(ang)*dist; if(x<60||y<60||x>GAME_CONSTANTS.WORLD_WIDTH-60||y>GAME_CONSTANTS.WORLD_HEIGHT-60){ n--; continue; } if(this.isPointInLight(x,y)){ n--; continue; } let inside=false; for(const w of this.getWalls()){ if(this.rectContainsPoint(w,x,y)){ inside=true; break; } } if(inside){ n--; continue; } this.enemies.push(new Enemy(x,y,Math.floor(Math.random()*5))); } },

  // Spawn individual
  spawnEnemy(){ if(this.enemies.length>=this.maxEnemies) return; for(let i=0;i<25;i++){ const x=40+Math.random()*(GAME_CONSTANTS.WORLD_WIDTH-80); const y=40+Math.random()*(GAME_CONSTANTS.WORLD_HEIGHT-80); if(Math.hypot(x-this.player.x,y-this.player.y) < GAME_CONSTANTS.ENEMY.MIN_SPAWN_DIST) continue; if(this.isPointInLight(x,y)) continue; let inside=false; for(const w of this.getWalls()){ if(this.rectContainsPoint(w,x,y)){ inside=true; break; } } if(inside) continue; this.enemies.push(new Enemy(x,y,Math.floor(Math.random()*5))); break; } },

  // Daño
  damagePlayer(a){ this.player.lives-=a; if(this.player.lives<=0) this.setGameOver('Derrotado'); },

    // Game Over / Victoria (con audio de eventos)
    setGameOver(msg){ const t=document.querySelector('#gameover-screen h1'); const d=document.querySelector('#gameover-screen p'); if(t) t.textContent='GAME OVER'; if(d) d.textContent=msg||'Has caído.'; try{Audio.playDefeat();}catch(_){ } this.setState('GAMEOVER'); },
    setVictory(){ const t=document.querySelector('#gameover-screen h1'); const d=document.querySelector('#gameover-screen p'); if(t) t.textContent='VICTORIA'; if(d) d.textContent='Escapaste.'; try{Audio.playVictory();}catch(_){ } this.setState('VICTORY'); },

  // Alertas
  spawnDifficultyAlert(msg){ 
      const layer=document.getElementById('alert-layer'); 
      if(!layer) return; 
      const div=document.createElement('div'); 
      div.className='game-alert'; 
      div.textContent=msg; 
      div.style.cssText='background:rgba(180,0,0,0.9);color:#fff;padding:15px 30px;margin:10px 0;border-radius:5px;font-size:18px;font-weight:bold;text-align:center;box-shadow:0 0 20px rgba(255,0,0,0.5);animation:fadeInOut 2.5s ease-in-out;';
      layer.appendChild(div); 
      setTimeout(()=>div.remove(),2500); 
  },
  spawnDifficultyAlertOnce(msg){ const now=performance.now?performance.now():Date.now(); const last=this.lastAlerts[msg]||0; if(now-last < this.alertCooldownMs) return; this.lastAlerts[msg]=now; this.spawnDifficultyAlert(msg); },

  // Laberinto
  getWalls(){ return this.walls && this.walls.length ? this.walls : MAP.walls; },
  getMazeStartPosition(){ const cell=64, margin=40; return {x: margin+cell*1+cell/2, y: margin+cell*1+cell/2}; },
    generateMazeWallsSeeded(seed){
        const margin=40, cell=64;
        const cols=Math.floor((GAME_CONSTANTS.WORLD_WIDTH - margin*2)/cell);
        const rows=Math.floor((GAME_CONSTANTS.WORLD_HEIGHT - margin*2)/cell);
        const W= cols%2===0?cols-1:cols;
        const H= rows%2===0?rows-1:rows;
        const grid=Array.from({length:H},()=>Array(W).fill(1));
        const inBounds=(x,y)=> x>0&&y>0&&x<W-1&&y<H-1;
        const rand=this.seededRandomFactory(this.seedStringToInt(seed));
        const stack=[];
        let cx=1, cy=1; grid[cy][cx]=0; stack.push([cx,cy]);
            const baseDirs=[[2,0],[-2,0],[0,2],[0,-2]];
            while(stack.length){
                const top=stack[stack.length-1];
                const x=top[0], y=top[1];
                // trabajar con una copia local para evitar corrupción accidental
                const dirs=baseDirs.slice();
                // shuffle dirs (Fisher–Yates)
                for(let i=dirs.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); const tmp=dirs[i]; dirs[i]=dirs[j]; dirs[j]=tmp; }
                let carved=false;
                for(let k=0;k<dirs.length;k++){
                    const d=dirs[k];
                    if(!d || d.length<2) continue;
                    const dx=d[0]|0, dy=d[1]|0;
                    const nx=x+dx, ny=y+dy;
                    if(inBounds(nx,ny) && grid[ny][nx]===1){
                        grid[y+dy/2][x+dx/2]=0; grid[ny][nx]=0; stack.push([nx,ny]); carved=true; break;
                    }
                }
            if(!carved) stack.pop();
        }
        const walls=[];
        walls.push({x:0,y:0,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:GAME_CONSTANTS.WORLD_HEIGHT-margin,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        walls.push({x:GAME_CONSTANTS.WORLD_WIDTH-margin,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        for(let y=0;y<H;y++){
            for(let x=0;x<W;x++){
                if(grid[y][x]===1){ walls.push({x:margin+x*cell,y:margin+y*cell,w:cell,h:cell}); }
            }
        }
        return walls;
    },
  seedStringToInt(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))>>>0; } return h; },
  seededRandomFactory(seed){ let s=seed>>>0; return ()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; s=s>>>0; return (s & 0xffffffff)/0x100000000; }; },

  // Utilidades espaciales
  rectContainsPoint(r,x,y){ return x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h; },
  pointInsideAnyWall(x,y){ for(const w of this.getWalls()) if(this.rectContainsPoint(w,x,y)) return true; return false; },
  rectOverlapsAnyWall(R){ for(const w of this.getWalls()){ if(!(R.x+R.w < w.x || R.x > w.x+w.w || R.y+R.h < w.y || R.y > w.y+w.h)) return true; } return false; },
  randomClearPoint(minX=60,minY=60,maxX=GAME_CONSTANTS.WORLD_WIDTH-60,maxY=GAME_CONSTANTS.WORLD_HEIGHT-60){ for(let i=0;i<200;i++){ const x=minX+Math.random()*(maxX-minX); const y=minY+Math.random()*(maxY-minY); if(this.pointInsideAnyWall(x,y)) continue; return {x,y}; } return null; },
  spawnRandomKeys(n){ const arr=[]; const MIN_PLAYER=600, MIN_BETWEEN=700; while(arr.length<n){ const p=this.randomClearPoint(); if(!p) break; if(Math.hypot(p.x-this.player.x,p.y-this.player.y) < MIN_PLAYER) continue; let ok=true; for(const k of arr){ if(Math.hypot(p.x-k.x,p.y-k.y) < MIN_BETWEEN){ ok=false; break; } } if(!ok) continue; arr.push({x:p.x,y:p.y,collected:false,progress:0,capturing:false}); } return arr; },
  spawnRandomExit(){ const W=100,H=80; for(let i=0;i<200;i++){ const p=this.randomClearPoint(); if(!p) break; const rect={x:p.x-W/2,y:p.y-H/2,w:W,h:H}; if(this.rectOverlapsAnyWall(rect)) continue; if(Math.hypot(rect.x+rect.w/2-this.player.x, rect.y+rect.h/2-this.player.y) < 1000) continue; return rect; } return null; },

  // Manchas sangre
  addSplat(x,y){ const splat={x,y,r:16+Math.random()*18,blobs:6+Math.floor(Math.random()*4),rot:Math.random()*Math.PI*2,seed:Math.random()*2,color:COLORS.ENEMY,born:performance.now?performance.now():Date.now(),life:900}; this.splats.push(splat); const now=performance.now?performance.now():Date.now(); this.splats=this.splats.filter(s=> now - s.born < s.life); if(this.splats.length>120) this.splats.shift(); },
    drawSplats(ctx, predicate){ const now=performance.now?performance.now():Date.now(); const test= predicate || (()=>true); for(const s of this.splats){ if(!test(s.x,s.y)) continue; const age=now - s.born; const alpha=0.6*(1-age/s.life); if(alpha<=0) continue; const sx=s.x-this.cameraX, sy=s.y-this.cameraY; ctx.save(); ctx.translate(sx,sy); ctx.rotate(s.rot); ctx.globalAlpha=alpha; ctx.fillStyle=s.color; for(let i=0;i<s.blobs;i++){ const ang=(Math.PI*2)*(i/s.blobs) + s.seed*i*0.25; const rx=Math.cos(ang)*s.r*(0.3+(i%2)*0.4); const ry=Math.sin(ang)*s.r*(0.3+((i+1)%2)*0.4); const rr=s.r*0.25 + Math.random()*s.r*0.25; ctx.beginPath(); ctx.arc(rx,ry,rr,0,Math.PI*2); ctx.fill(); } ctx.restore(); } this.splats=this.splats.filter(s=> now - s.born < s.life); },
  drawBulletsOnTop(ctx){ for(const b of this.bullets){ const hx=b.x-this.cameraX, hy=b.y-this.cameraY; const tx=hx - b.dx*b.length, ty=hy - b.dy*b.length; ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle='#ffdd57'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(hx,hy); ctx.stroke(); const g=ctx.createRadialGradient(hx,hy,0,hx,hy,10); g.addColorStop(0,'rgba(255,221,87,0.9)'); g.addColorStop(1,'rgba(255,221,87,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(hx,hy,10,0,Math.PI*2); ctx.fill(); ctx.restore(); } },
    // Procedural patterns & ambient blood
    createProceduralPatterns(){ this.assets.floorPattern=this.makeFloorPattern(64); this.assets.wallPattern=this.makeBrickPattern(64,64); this.assets.bloodSprites=Array.from({length:6},()=>this.makeBloodSprite(64)); },
    makeFloorPattern(size=64){ const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d'); g.fillStyle='#2a2d33'; g.fillRect(0,0,size,size); g.fillStyle='#262a30'; g.fillRect(0,0,size,size/2); g.fillStyle='rgba(255,255,255,0.03)'; for(let i=0;i<18;i++){ const x=Math.random()*size, y=Math.random()*size, r=Math.random()*1.5; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); } return g.createPattern(c,'repeat'); },
    makeBrickPattern(w=64,h=64){ const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); g.fillStyle='#555a60'; g.fillRect(0,0,w,h); const brickW=20, brickH=10; g.fillStyle='#3c4147'; for(let y=0;y<h;y+=brickH){ g.fillRect(0,y,w,1); } for(let y=0;y<h;y+=brickH){ const offset=(y/brickH)%2? brickW/2:0; for(let x=-offset;x<w;x+=brickW){ g.fillRect(x,y,1,brickH); } } g.fillStyle='rgba(0,0,0,0.08)'; g.fillRect(0,0,w,h); return g.createPattern(c,'repeat'); },
    makeBloodSprite(size=64){ const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d'); g.translate(size/2,size/2); const blobs=6+Math.floor(Math.random()*5), R=size*0.35; for(let i=0;i<blobs;i++){ const ang=(Math.PI*2)*(i/blobs)+Math.random()*0.5; const r=R*(0.5+Math.random()*0.7); const x=Math.cos(ang)*r, y=Math.sin(ang)*r, rr=6+Math.random()*10; const grad=g.createRadialGradient(x,y,0,x,y,rr); grad.addColorStop(0,'rgba(160,10,10,0.8)'); grad.addColorStop(1,'rgba(100,0,0,0)'); g.fillStyle=grad; g.beginPath(); g.arc(x,y,rr,0,Math.PI*2); g.fill(); } return c; },
    generateAmbientBloodDecals(count=80){ this.ambientDecals=[]; if(!this.assets.bloodSprites) return; for(let i=0;i<count;i++){ const p=this.randomClearPoint(); if(!p) break; this.ambientDecals.push({ x:p.x, y:p.y, rot:Math.random()*Math.PI*2, img:this.assets.bloodSprites[Math.floor(Math.random()*this.assets.bloodSprites.length)], alpha:0.7*(0.6+Math.random()*0.4)}); } },
    drawAmbientDecals(ctx, predicate){ const test= predicate || (()=>true); for(const d of this.ambientDecals){ if(!test(d.x,d.y)) continue; const sx=d.x-this.cameraX, sy=d.y-this.cameraY; if(sx<-80||sy<-80||sx>this.canvas.width+80||sy>this.canvas.height+80) continue; ctx.save(); ctx.globalAlpha=d.alpha; ctx.translate(sx,sy); ctx.rotate(d.rot); const s=56; ctx.drawImage(d.img,-s/2,-s/2,s,s); ctx.restore(); } },
    drawTiledFloor(ctx){ const tile=64; const offsetX=-(this.cameraX % tile); const offsetY=-(this.cameraY % tile); if(this.assets.floorPattern){ ctx.save(); ctx.translate(offsetX,offsetY); ctx.fillStyle=this.assets.floorPattern; ctx.fillRect(-offsetX,-offsetY,this.canvas.width+tile,this.canvas.height+tile); ctx.restore(); } else { const floorGrad=ctx.createRadialGradient(this.canvas.width/2,this.canvas.height/2,0,this.canvas.width/2,this.canvas.height/2,Math.max(this.canvas.width,this.canvas.height)); floorGrad.addColorStop(0,'#130a0c'); floorGrad.addColorStop(1,'#1b0e10'); ctx.fillStyle=floorGrad; ctx.fillRect(0,0,this.canvas.width,this.canvas.height); } },

  // Colisiones / rayos
  circleRectOverlap(cx,cy,cr,r){ const nx=Math.max(r.x,Math.min(cx,r.x+r.w)); const ny=Math.max(r.y,Math.min(cy,r.y+r.h)); const dx=cx-nx, dy=cy-ny; return (dx*dx + dy*dy) < cr*cr; },
  resolveEntityVsWalls(ent,rad){ for(const w of this.getWalls()){ if(!this.circleRectOverlap(ent.x,ent.y,rad,w)) continue; const left=ent.x - w.x; const right=(w.x+w.w) - ent.x; const top=ent.y - w.y; const bottom=(w.y+w.h) - ent.y; const minX=Math.min(left,right); const minY=Math.min(top,bottom); if(minX < minY){ if(left < right) ent.x=w.x - rad; else ent.x=w.x + w.w + rad; } else { if(top < bottom) ent.y=w.y - rad; else ent.y=w.y + w.h + rad; } } ent.x=Math.max(40,Math.min(GAME_CONSTANTS.WORLD_WIDTH-40,ent.x)); ent.y=Math.max(40,Math.min(GAME_CONSTANTS.WORLD_HEIGHT-40,ent.y)); },
  lineHitsCircle(b,e){ const hx=b.x, hy=b.y; const tx=hx - b.dx*b.length, ty=hy - b.dy*b.length; const vx=hx-tx, vy=hy-ty; const wx=e.x - tx, wy=e.y - ty; const c1=vx*wx + vy*wy; const c2=vx*vx + vy*vy; let t=c1/c2; t=Math.max(0,Math.min(1,t)); const px=tx + t*vx, py=ty + t*vy; return Math.hypot(e.x-px,e.y-py) <= e.r; },
  rayHitsWall(x0,y0,x1,y1){ for(const w of this.getWalls()) if(this.lineIntersectsRect(x0,y0,x1,y1,w)) return true; return false; },
  lineIntersectsRect(x0,y0,x1,y1,rect){ const rx=rect.x, ry=rect.y, rw=rect.w, rh=rect.h; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx,ry,rx+rw,ry)) return true; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx,ry+rh,rx+rw,ry+rh)) return true; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx,ry,rx,ry+rh)) return true; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx+rw,ry,rx+rw,ry+rh)) return true; if(x0>=rx && x0<=rx+rw && y0>=ry && y0<=ry+rh) return true; return false; },
    bulletHitsAnyWall(b){ const hx=b.x, hy=b.y; const tx=hx - b.dx*b.length, ty=hy - b.dy*b.length; for(const w of this.getWalls()){ if(this.lineIntersectsRect(hx,hy,tx,ty,w) || this.rectContainsPoint(w,hx,hy) || this.rectContainsPoint(w,tx,ty)) return true; } return false; },
  segmentIntersectsSegment(x1,y1,x2,y2,x3,y3,x4,y4){ const denom=(x1-x2)*(y3-y4) - (y1-y2)*(x3-x4); if(Math.abs(denom)<1e-10) return false; const t=((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4))/denom; const u=-((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3))/denom; return t>=0 && t<=1 && u>=0 && u<=1; },
  computeVisibilityCone(px,py,r,a0,a1){ const S=96; const pts=[]; const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)); let start=wrap(a0), end=wrap(a1); if(end<start) end+=Math.PI*2; for(let i=0;i<=S;i++){ const t=i/S; const ang=start + (end - start)*t; const a=wrap(ang); pts.push(this.castRayToWalls(px,py,a,r)); } return pts; },
  castRayToWalls(px,py,ang,maxD){ const dx=Math.cos(ang), dy=Math.sin(ang); let nearest={x:px+dx*maxD,y:py+dy*maxD,dist:maxD}; const check=(x3,y3,x4,y4)=>{ const hit=this.raySegmentIntersection(px,py,dx,dy,x3,y3,x4,y4); if(hit && hit.t>=0 && hit.t<=maxD && hit.t<nearest.dist){ const t=Math.max(0,hit.t-1.5); nearest={x:px+dx*t,y:py+dy*t,dist:t}; } }; for(const w of this.getWalls()){ check(w.x,w.y,w.x+w.w,w.y); check(w.x,w.y+w.h,w.x+w.w,w.y+w.h); check(w.x,w.y,w.x,w.y+w.h); check(w.x+w.w,w.y,w.x+w.w,w.y+w.h); } return {x:nearest.x,y:nearest.y}; },
  raySegmentIntersection(px,py,dx,dy,x3,y3,x4,y4){ const rx=dx, ry=dy, sx=x4-x3, sy=y4-y3; const rxs=rx*sy - ry*sx; if(Math.abs(rxs)<1e-8) return null; const qpx=x3-px, qpy=y3-py; const t=(qpx*sy - qpy*sx)/rxs; const u=(qpx*ry - qpy*rx)/rxs; if(t>=0 && u>=0 && u<=1) return {t}; return null; }
};