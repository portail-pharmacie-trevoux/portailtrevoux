/* Court métrage vectoriel original : le pilote retrouve son univers. */
(() => {
  const canvas = document.querySelector('#login-film');
  if (!canvas) return;
  const c = canvas.getContext('2d');
  if (!c) return;
  const W = 800, H = 450, duration = 11000;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const replay = document.querySelector('#login-film-replay');
  let raf = 0, start = 0;
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  function round(x,y,w,h,r,fill,stroke) {
    c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}
  }
  function ellipse(x,y,rx,ry,fill,stroke) {
    c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}
  }
  function line(points,color,width=3) {
    c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();
  }
  function label(text,x,y,size,color,weight=600) {
    c.font=`${weight} ${size}px Arial, sans-serif`;c.fillStyle=color;c.textAlign='center';c.fillText(text,x,y);
  }
  function pilot(x,y,scale,calm,t) {
    c.save();c.translate(x,y);c.scale(scale,scale);
    // Combinaison, épaules et col.
    const suit=c.createLinearGradient(0,55,0,145);suit.addColorStop(0,'#fbfcff');suit.addColorStop(1,'#99b5d0');
    round(-68,62,136,88,35,suit,'#273755');
    round(-48,81,96,42,16,'#566b95');round(-26,93,52,23,8,'#41b6a3');
    line([[-10,105],[10,105]],'#e8fff8',5);line([[0,95],[0,115]],'#e8fff8',5);
    // Casque de verre et visage sculpté par les ombres.
    ellipse(0,0,81,91,'#a5e3f424','#859ebb');
    ellipse(0,4,66,76,'#d8936f');ellipse(-3,-3,61,69,'#f4c29a');
    ellipse(-59,10,10,18,'#edb088');ellipse(59,10,10,18,'#edb088');
    c.fillStyle='#43314a';c.beginPath();c.moveTo(-56,-31);c.bezierCurveTo(-64,-88,55,-94,58,-32);c.bezierCurveTo(29,-47,12,-31,-7,-58);c.bezierCurveTo(-21,-29,-41,-32,-56,-31);c.fill();
    // Sourcils et yeux : le souci se transforme en sourire.
    const brow=calm*10;
    line([[-39,-16],[-18,-25+brow]],'#53394a',5);line([[18,-25+brow],[39,-16]],'#53394a',5);
    const blink = Math.sin(t*2.7)>0.994;
    if(blink || calm>.8){
      c.strokeStyle='#3c334d';c.lineWidth=4;c.beginPath();c.arc(-28,1,10,Math.PI,2*Math.PI);c.stroke();c.beginPath();c.arc(28,1,10,Math.PI,2*Math.PI);c.stroke();
    }else{
      ellipse(-27,0,11,13,'#fff');ellipse(27,0,11,13,'#fff');ellipse(-24+Math.sin(t*3)*2,1,5,7,'#293c54');ellipse(30+Math.sin(t*3)*2,1,5,7,'#293c54');ellipse(-25,-2,2,2,'#fff');ellipse(29,-2,2,2,'#fff');
    }
    line([[0,7],[-4,20],[5,23]],'#cd8b70',3);
    ellipse(-40,25,12,6,'#f19c8544');ellipse(40,25,12,6,'#f19c8544');
    c.strokeStyle='#99555b';c.lineWidth=4;c.beginPath();c.moveTo(-18,43);c.quadraticCurveTo(0,31+calm*29,18,43);c.stroke();
    // Reflets du casque et arceau : la silhouette reste lisible en petit.
    c.strokeStyle='#d3f3ff';c.lineWidth=7;c.beginPath();c.ellipse(0,0,80,90,0,.12,Math.PI-.12);c.stroke();
    c.strokeStyle='#ffffffb0';c.lineWidth=5;c.beginPath();c.ellipse(-4,-6,68,76,0,3.45,4.35);c.stroke();
    round(-85,-2,17,36,7,'#697b9d');round(68,-2,17,36,7,'#697b9d');
    c.restore();
  }
  function card(x,y,angle,kind,alpha,scale=1) {
    c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);c.globalAlpha*=alpha;
    c.shadowColor='#020b2444';c.shadowBlur=18;c.shadowOffsetY=6;
    round(-69,-43,138,86,13,'#f6faff');c.shadowBlur=0;c.shadowOffsetY=0;
    round(-69,-43,138,24,[13,13,0,0],kind.color);
    label(kind.name,0,-26,12,'#fff',700);
    round(-52,-6,17,17,4,kind.color+'35');line([[-25,-3],[49,-3]],'#a7b5cd',4);line([[-25,10],[30,10]],'#cad4e5',4);line([[-50,28],[48,28]],'#d9e1ec',4);
    c.restore();
  }
  const cards=[{name:'Rendez-vous',color:'#437cb0'},{name:'Commandes',color:'#7654a7'},{name:'Documents',color:'#288e87'},{name:'Messages',color:'#b26e8e'},{name:'Formations',color:'#987837'},{name:'Équipe',color:'#5277ad'}];
  function planet(t) {
    c.save();c.translate(400,184);
    const glow=c.createRadialGradient(0,0,30,0,0,180);glow.addColorStop(0,'#52d6b842');glow.addColorStop(1,'#52d6b800');c.fillStyle=glow;c.fillRect(-190,-190,380,380);
    c.save();c.rotate(-.24);ellipse(0,0,166,48,null,'#ac85e0');c.restore();
    const g=c.createRadialGradient(-36,-43,7,5,10,96);g.addColorStop(0,'#8df0c0');g.addColorStop(.42,'#30b69a');g.addColorStop(1,'#087363');ellipse(0,0,88,88,g);
    c.save();c.beginPath();c.arc(0,0,88,0,Math.PI*2);c.clip();
    c.translate(Math.sin(t*.4)*14,0);c.fillStyle='#b9f6d947';c.beginPath();c.moveTo(-66,-59);c.bezierCurveTo(-3,-71,-41,-10,6,-13);c.bezierCurveTo(39,-12,32,53,64,63);c.lineTo(36,83);c.bezierCurveTo(-5,30,-13,33,-27,6);c.bezierCurveTo(-51,-33,-39,-29,-88,-13);c.fill();
    c.restore();round(-12,-40,24,80,5,'#f5fff9');round(-40,-12,80,24,5,'#f5fff9');
    c.save();c.rotate(-.24);c.beginPath();c.ellipse(0,0,166,48,0,0,Math.PI);c.strokeStyle='#b38ae8';c.lineWidth=9;c.stroke();c.restore();
    c.restore();
  }
  function ship(x,y,s,t) {
    c.save();c.translate(x,y);c.scale(s,s);
    const flame=c.createLinearGradient(-130,20,-65,20);flame.addColorStop(0,'#72e9db00');flame.addColorStop(1,'#bcfff3');c.fillStyle=flame;c.beginPath();c.moveTo(-140-Math.sin(t*20)*8,20);c.lineTo(-62,3);c.lineTo(-62,36);c.closePath();c.fill();
    const hull=c.createLinearGradient(0,-20,0,60);hull.addColorStop(0,'#fbfbff');hull.addColorStop(1,'#8ea9ca');
    ellipse(0,18,91,30,hull,'#536d92');
    round(-70,15,18,22,5,'#7054a0');
    c.save();c.beginPath();c.ellipse(1,-10,51,53,0,Math.PI,Math.PI*2);c.lineTo(52,12);c.lineTo(-50,12);c.closePath();c.fillStyle='#a4d8eea0';c.fill();c.clip();pilot(0,-14,.46,1,t);c.restore();
    c.beginPath();c.ellipse(1,-10,51,53,0,Math.PI,Math.PI*2);c.strokeStyle='#c8f4ff';c.lineWidth=4;c.stroke();
    round(-32,25,74,10,5,'#7653a5');ellipse(64,15,9,6,'#57e5bc');
    c.restore();
  }
  function draw(seconds) {
    const t=Math.min(11,seconds);c.clearRect(0,0,W,H);
    const bg=c.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#182c4c');bg.addColorStop(.55,'#24274d');bg.addColorStop(1,'#134948');c.fillStyle=bg;c.fillRect(0,0,W,H);
    for(let i=0;i<75;i++){const x=(i*137+31)%W,y=(i*83+19)%H;ellipse(x,y,i%7===0?1.9:1,i%7===0?1.9:1,`rgba(210,236,255,${.25+.3*Math.sin(i+t*.5)**2})`);}
    const change=ease((t-3.7)/2), calm=ease((t-2.8)/1.6);
    // ACTE I : gros plan dans le cockpit, informations dispersées.
    c.save();c.globalAlpha=1-change;
    c.strokeStyle='#8499bf';c.lineWidth=15;c.beginPath();c.ellipse(400,250,354,265,0,Math.PI,2*Math.PI);c.stroke();
    const dashboard=c.createLinearGradient(0,310,0,450);dashboard.addColorStop(0,'#607498');dashboard.addColorStop(1,'#263753');round(52,333,696,170,35,dashboard);
    round(85,351,190,74,15,'#24334f','#8aa5c2');round(525,351,190,74,15,'#24334f','#8aa5c2');
    for(let i=0;i<5;i++){round(102+i*31,370,15,9,4,i%2?'#be8ae7':'#54d5b4');round(548+i*28,370,13,30,4,'#5e8eac');}
    pilot(400,207+Math.sin(t*2)*2,1.16,calm,t);
    ellipse(333,360,26,15,'#efb48c');ellipse(467,360,26,15,'#efb48c');
    c.strokeStyle='#26344e';c.lineWidth=12;c.beginPath();c.arc(400,399,73,Math.PI,2*Math.PI);c.stroke();
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3-.2+t*.16;const r=1-ease((t-3.2)/1.6);
      const x=400+Math.cos(a)*285*r,y=211+Math.sin(a)*145*r;
      card(x,y,Math.sin(t*1.4+i)*.12,cards[i],r,.92);
    }
    c.restore();
    // ACTE II : les informations convergent, puis le pilote trouve une orbite douce.
    if(change>0){
      c.save();c.globalAlpha=change;planet(t);
      const orbit=ease((t-5)/5.5),a=orbit*Math.PI*2-.7;
      const x=400+Math.cos(a)*238,y=184+Math.sin(a)*111,scale=.74+Math.sin(a)*.16;
      if(Math.sin(a)<0){ship(x,y,scale,t);planet(t);}else ship(x,y,scale,t);
      const end=ease((t-7)/1.2);c.globalAlpha=change*end;
      label('PORTAIL',386,352,44,'#e8fff8',800);label('+',521,352,48,'#c6a1f5',800);
      label('Tous vos univers, dans un même espace',400,392,20,'#d3e9e8',500);
      c.restore();
    }
    if(t<3.7)label('Trop d’informations… où donner de la tête ?',400,34,17,'#edf5ff',500);
    else if(t<7) {c.save();c.globalAlpha=Math.sin(clamp((t-3.7)/3.3)*Math.PI);label('Un seul espace pour retrouver son calme.',400,34,17,'#edf5ff',500);c.restore();}
  }
  function play() {
    cancelAnimationFrame(raf);start=performance.now();replay.textContent='Recommencer le film';
    function frame(now){const elapsed=now-start;draw(elapsed/1000);if(elapsed<duration&&!document.hidden)raf=requestAnimationFrame(frame);}
    raf=requestAnimationFrame(frame);
  }
  replay.addEventListener('click',play);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);draw(11);}});
  reduce.addEventListener('change',()=>{if(reduce.matches){cancelAnimationFrame(raf);draw(11);}});
  if(reduce.matches)draw(11);else play();
})();
