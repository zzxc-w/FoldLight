// Deterministic vector artwork and antialiased PNGs; no image packages or network.
// Icons have an opaque square background. The operating system applies its mask.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const background = [29, 36, 37];
const panels = [
  { path: [['M',.20,.20],['C',.27,.235,.335,.29,.40,.325],['L',.40,.775],['C',.335,.75,.27,.695,.20,.66],['Z']], top: [237,214,165], bottom: [174,139,81] },
  { path: [['M',.40,.325],['C',.467,.358,.533,.358,.60,.325],['L',.60,.775],['C',.533,.808,.467,.808,.40,.775],['Z']], top: [183,149,91], bottom: [219,186,129] },
  { path: [['M',.60,.325],['C',.665,.29,.73,.235,.80,.20],['L',.80,.66],['C',.73,.695,.665,.75,.60,.775],['Z']], top: [240,218,174], bottom: [189,154,95] }
];
const silhouette = [['M',.20,.20],['C',.30,.25,.37,.35,.50,.35],['C',.63,.35,.70,.25,.80,.20],['L',.80,.66],['C',.70,.71,.63,.80,.50,.80],['C',.37,.80,.30,.71,.20,.66],['Z']];
const creases = [ [['M',.40,.325],['L',.40,.775]], [['M',.60,.325],['L',.60,.775]] ];
const outlineColor = [242,220,173];
const hex = rgb => '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
const svgPath = commands => commands.map(([command,...values])=>command+values.map(v=>(v*512).toFixed(3)).join(' ')).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${panels.map((panel,i)=>`<linearGradient id="p${i}" gradientUnits="userSpaceOnUse" x1="0" y1="102.4" x2="0" y2="409.6"><stop stop-color="${hex(panel.top)}"/><stop offset="1" stop-color="${hex(panel.bottom)}"/></linearGradient>`).join('')}</defs><rect width="512" height="512" fill="${hex(background)}"/>${panels.map((panel,i)=>`<path d="${svgPath(panel.path)}" fill="url(#p${i})"/>`).join('')}<path d="${svgPath(silhouette)}" fill="none" stroke="${hex(outlineColor)}" stroke-width="5" stroke-linejoin="round"/>${creases.map(path=>`<path d="${svgPath(path)}" fill="none" stroke="#846d45" stroke-width="3"/>`).join('')}</svg>\n`;
writeFileSync(new URL('../public/icon.svg',import.meta.url),svg);

// Flatten the same Bezier paths for a small supersampling rasterizer.
function flatten(commands,scale) {
  const points=[];let current,first;
  const point=(x,y)=>[(x-.5)*scale+.5,(y-.5)*scale+.5];
  for(const [command,...v] of commands){
    if(command==='M'){current=[v[0],v[1]];first=current;points.push(point(...current));}
    else if(command==='L'){current=[v[0],v[1]];points.push(point(...current));}
    else if(command==='C'){
      const [x,y]=current;
      for(let step=1;step<=32;step++){const t=step/32,u=1-t;points.push(point(u*u*u*x+3*u*u*t*v[0]+3*u*t*t*v[2]+t*t*t*v[4],u*u*u*y+3*u*u*t*v[1]+3*u*t*t*v[3]+t*t*t*v[5]));}
      current=[v[4],v[5]];
    }else if(command==='Z'){points.push(point(...first));current=first;}
  }
  return points;
}
const crc32 = data => { let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; };
const chunk=(type,data)=>{const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};
function png(size,scale=1){
  const samples=4,n=size*samples,bitmap=Buffer.alloc(n*n*3);
  for(let i=0;i<n*n;i++)for(let c=0;c<3;c++)bitmap[i*3+c]=background[c];
  const stroke=(commands,width,color)=>{
    const points=flatten(commands,scale).map(([x,y])=>[x*n,y*n]),radius=width*n*scale/2;
    for(let i=1;i<points.length;i++){
      const [ax,ay]=points[i-1],[bx,by]=points[i],dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
      for(let y=Math.max(0,Math.floor(Math.min(ay,by)-radius));y<Math.min(n,Math.ceil(Math.max(ay,by)+radius));y++)
        for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-radius));x<Math.min(n,Math.ceil(Math.max(ax,bx)+radius));x++){
          const t=length?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/length)):0;
          if((x+.5-ax-t*dx)**2+(y+.5-ay-t*dy)**2<=radius*radius)for(let c=0;c<3;c++)bitmap[(y*n+x)*3+c]=color[c];
        }
    }
  };
  for(const panel of panels){
    const points=flatten(panel.path,scale);
    for(let y=0;y<n;y++){
      const py=(y+.5)/n,intersections=[];
      for(let i=1;i<points.length;i++){
        const [ax,ay]=points[i-1],[bx,by]=points[i];
        if((ay>py)!==(by>py))intersections.push(ax+(py-ay)*(bx-ax)/(by-ay));
      }
      intersections.sort((a,b)=>a-b);
      const t=Math.max(0,Math.min(1,((py-.5)/scale+.5-.2)/.6)),color=panel.top.map((v,c)=>Math.round(v*(1-t)+panel.bottom[c]*t));
      for(let i=0;i<intersections.length;i+=2)for(let x=Math.max(0,Math.ceil(intersections[i]*n-.5));x<Math.min(n,Math.ceil(intersections[i+1]*n-.5));x++)for(let c=0;c<3;c++)bitmap[(y*n+x)*3+c]=color[c];
    }
  }
  stroke(silhouette,5/512,outlineColor);for(const crease of creases)stroke(crease,3/512,[132,109,69]);
  const pixels=Buffer.alloc((size*3+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++){
    let total=0;for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++)total+=bitmap[(((y*samples+sy)*n+x*samples+sx)*3)+c];
    pixels[y*(size*3+1)+1+x*3+c]=Math.round(total/(samples*samples));
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
for(const size of [192,512]){
  const bytes=png(size);
  writeFileSync(new URL(`../public/icon-${size}-v2.png`,import.meta.url),bytes);
  writeFileSync(new URL(`../public/icon-${size}.png`,import.meta.url),bytes);
}
writeFileSync(new URL('../public/apple-touch-icon-v2.png',import.meta.url),png(180));
// Every foreground point fits inside the central 40%-radius maskable safe circle.
writeFileSync(new URL('../public/icon-maskable-v2.png',import.meta.url),png(512,.88));
