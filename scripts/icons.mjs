// Rebuild the bundled PWA icons without image libraries or network assets.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const crc32 = data => { let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; };
const chunk=(type,data)=>{const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};
for(const n of [192,512]){
  const pixels=Buffer.alloc((n*3+1)*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const o=y*(n*3+1)+1+x*3;pixels[o]=32;pixels[o+1]=36;pixels[o+2]=38;}
  const line=(a,b)=>{
    const [ax,ay]=a.map(v=>v*n),[bx,by]=b.map(v=>v*n),dx=bx-ax,dy=by-ay;
    for(let y=Math.max(0,Math.floor(Math.min(ay,by)-n*.025));y<Math.min(n,Math.ceil(Math.max(ay,by)+n*.025));y++)
      for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-n*.025));x<Math.min(n,Math.ceil(Math.max(ax,bx)+n*.025));x++){
        const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
        if(Math.hypot(x-ax-t*dx,y-ay-t*dy)<n*.022){const o=y*(n*3+1)+1+x*3;pixels[o]=217;pixels[o+1]=191;pixels[o+2]=139;}
      }
  };
  const points=[[.21,.27],[.41,.18],[.60,.27],[.79,.18],[.79,.75],[.60,.84],[.41,.75],[.21,.84],[.21,.27]];
  for(let i=0;i<points.length-1;i++)line(points[i],points[i+1]);
  line([.41,.18],[.41,.75]);line([.60,.27],[.60,.84]);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(n,0);ihdr.writeUInt32BE(n,4);ihdr[8]=8;ihdr[9]=2;
  writeFileSync(new URL(`../public/icon-${n}.png`,import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
