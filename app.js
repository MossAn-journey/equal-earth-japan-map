const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const JAPAN_URL = 'https://raw.githubusercontent.com/dataofjapan/land/master/japan.topojson';
const svg = d3.select('#map');
const wrap = document.querySelector('#mapWrap');
const loading = document.querySelector('#loading');
const root = svg.append('g');
const bgG = root.append('g');
const gridG = root.append('g');
const japanG = root.append('g');
const labelsG = root.append('g');
const overlayG = root.append('g');

let world, japan, japanMesh;
let projection, zoom;
let japanOffset = [0, 0];
let baseJapanPosition = [0, 0];
let japanOpacity = 0.5;
let showJapan = true, showPref = true, showGrid = true, showLabels = true;
let activeRegion = 'all';

const regions = {
  all: null,
  hokkaido: [139,46,146,41], honshu: [128,42,143,33], shikoku: [132,35,135,32],
  kyushu: [129,34,132,30], okinawa: [121,31,132,23], north: [140,48,151,42]
};

function size(){ return [wrap.clientWidth, wrap.clientHeight]; }

function makeProjection(w,h){
  const p = d3.geoEqualEarth().rotate([-150,0,0]);
  p.fitExtent([[20,20],[w-20,h-20]], world);
  return p;
}

function projectJapanFeature(feature){
  return d3.geoPath(projection)(feature);
}

function selectedJapan(){
  if(activeRegion === 'all') return japan;
  const b = regions[activeRegion];
  if(!b || !japan?.features) return japan;
  const [minLon,maxLat,maxLon,minLat] = b;
  const features = japan.features.filter(f => {
    const [lon,lat] = d3.geoCentroid(f);
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
  });
  return features.length ? {type:'FeatureCollection',features} : japan;
}

function drawBackground(w,h){
  bgG.selectAll('*').remove();
  const path = d3.geoPath(projection);
  bgG.append('path').datum(world).attr('class','world-land').attr('d',path);
  if(showGrid){
    const gr = d3.geoGraticule().step([10,10]);
    gridG.selectAll('*').remove();
    gridG.append('path').datum(gr()).attr('class','grid-line').attr('d',path);
  } else gridG.selectAll('*').remove();
}

function drawJapan(){
  japanG.selectAll('*').remove();
  if(!showJapan) return;
  const path = d3.geoPath(projection);
  const g = japanG.append('g')
    .attr('class','japan-overlay')
    .attr('transform',`translate(${japanOffset[0]},${japanOffset[1]})`)
    .style('opacity',japanOpacity);

  g.append('path').datum(japan).attr('class','japan-fill').attr('d',path);
  if(showPref && japanMesh) g.append('path').datum(japanMesh).attr('class','japan-boundary').attr('d',path);
  g.append('path').datum(japan).attr('class','japan-outline').attr('d',path);
  if(showLabels) drawJapanLabels(g);

  g.call(d3.drag()
    .on('start', function(event){ event.sourceEvent.stopPropagation(); d3.select(this).raise().classed('dragging',true); })
    .on('drag', function(event){
      event.sourceEvent.stopPropagation();
      const k = d3.zoomTransform(svg.node()).k;
      japanOffset[0] += event.dx / k;
      japanOffset[1] += event.dy / k;
      d3.select(this).attr('transform',`translate(${japanOffset[0]},${japanOffset[1]})`);
    })
    .on('end', function(event){ event.sourceEvent.stopPropagation(); d3.select(this).classed('dragging',false); })
  );
}

function drawJapanLabels(g){
  const labels = [
    ['北海道',142.8,43.5,'region-label'], ['本州',138.1,36.4,'region-label'],
    ['四国',133.5,33.7,'region-label'], ['九州',130.7,32.2,'region-label'],
    ['沖縄県',127.8,26.3,'region-label']
  ];
  labels.forEach(([text,lon,lat,cls])=>{
    const p=projection([lon,lat]);
    if(p) g.append('text').attr('class',cls).attr('x',p[0]).attr('y',p[1]).attr('text-anchor','middle').text(text);
  });
  [['択捉島',147.1,45],['国後島',145.9,44.1],['色丹島',146.9,43.8],['歯舞群島',146.3,43.5]].forEach(([text,lon,lat])=>{
    const p=projection([lon,lat]);
    if(p) g.append('text').attr('class','territory-label').attr('x',p[0]+5).attr('y',p[1]).text(text);
  });
  const q=projection([147,46]);
  if(q) g.append('text').attr('class','territory-label territory-title').attr('x',q[0]+20).attr('y',q[1]+18).text('北方領土');
}

function drawLabels(){
  labelsG.selectAll('*').remove();
  if(!showLabels) return;
  const labels = [
    ['ロシア',130,56], ['中国',104,35], ['韓国',127.5,37.5], ['オーストラリア',134,-25],
    ['日本海',136,39], ['太平洋',166,34], ['東シナ海',124,28], ['オホーツク海',150,52]
  ];
  labels.forEach(([text,lon,lat])=>{
    const p=projection([lon,lat]);
    if(p && p[0]>0 && p[0]<size()[0] && p[1]>0 && p[1]<size()[1])
      labelsG.append('text').attr('class','background-label').attr('x',p[0]).attr('y',p[1]).attr('text-anchor','middle').text(text);
  });
}

function drawScale(w,h){
  overlayG.selectAll('*').remove();
  const x=22,y=h-24,len=Math.min(180,Math.max(100,w*.18));
  overlayG.append('line').attr('class','scale-line').attr('x1',x).attr('x2',x+len).attr('y1',y).attr('y2',y);
  [0,.5,1].forEach(t=>overlayG.append('line').attr('class','scale-line').attr('x1',x+len*t).attr('x2',x+len*t).attr('y1',y-5).attr('y2',y+5));
  overlayG.append('text').attr('class','scale-label').attr('x',x).attr('y',y-8).text('0');
  overlayG.append('text').attr('class','scale-label').attr('x',x+len/2).attr('y',y-8).attr('text-anchor','middle').text('5,000 km');
  overlayG.append('text').attr('class','scale-label').attr('x',x+len).attr('y',y-8).attr('text-anchor','end').text('10,000 km');
}

function draw(){
  const [w,h]=size();
  projection=makeProjection(w,h);
  drawBackground(w,h);
  drawLabels();
  drawJapan();
  drawScale(w,h);
  document.querySelector('#opacityValue').textContent=`${Math.round(japanOpacity*100)}%`;
  setupZoom();
  if(zoom) svg.call(zoom.transform,d3.zoomTransform(svg.node()));
}

function setupZoom(){
  if(zoom) return;
  zoom=d3.zoom().scaleExtent([0.7,12]).on('zoom',e=>root.attr('transform',e.transform));
  svg.call(zoom);
}

function resetJapan(){ japanOffset=[...baseJapanPosition]; drawJapan(); }
function updateRegionButtons(){document.querySelectorAll('[data-region]').forEach(b=>b.classList.toggle('active',b.dataset.region===activeRegion));}

async function init(){
  try{
    const [wt,jt]=await Promise.all([d3.json(WORLD_URL),d3.json(JAPAN_URL)]);
    world=topojson.feature(wt,wt.objects.countries);
    japan=topojson.feature(jt,jt.objects.japan);
    japanMesh=topojson.mesh(jt,jt.objects.japan,(a,b)=>a!==b);
    loading.remove();
    draw();
  }catch(err){
    loading.textContent='地図データの読み込みに失敗しました。通信状態を確認してください。';
    console.error(err);
  }
}

document.querySelector('#japanToggle').addEventListener('change',e=>{showJapan=e.target.checked;drawJapan();});
document.querySelector('#prefToggle').addEventListener('change',e=>{showPref=e.target.checked;drawJapan();});
document.querySelector('#gridToggle').addEventListener('change',e=>{showGrid=e.target.checked;draw();});
document.querySelector('#labelsToggle').addEventListener('change',e=>{showLabels=e.target.checked;draw();});
document.querySelector('#opacity').addEventListener('input',e=>{japanOpacity=+e.target.value/100;document.querySelector('#opacityValue').textContent=`${e.target.value}%`;japanG.select('.japan-overlay').style('opacity',japanOpacity);});
document.querySelector('#resetJapanBtn').addEventListener('click',resetJapan);
document.querySelector('#resetJapanBtn2').addEventListener('click',resetJapan);
document.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>{activeRegion=b.dataset.region;updateRegionButtons();if(activeRegion==='north'){japanOffset=[40,-15];}else{japanOffset=[0,0];}drawJapan();}));
document.querySelector('#zoomIn').addEventListener('click',()=>svg.transition().call(zoom.scaleBy,1.35));
document.querySelector('#zoomOut').addEventListener('click',()=>svg.transition().call(zoom.scaleBy,1/1.35));
window.addEventListener('resize',draw);
init();
