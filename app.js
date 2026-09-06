const DATA_URL = 'https://unpkg.com/jpn-atlas@1/japan/japan.json';
const svg = d3.select('#map');
const wrap = document.querySelector('#mapWrap');
const loading = document.querySelector('#loading');
let topology, country, prefectures, prefMesh;
let mode = 'equal';
let centerLon = 150;
let activeRegion = 'all';
let showPref = true, showGrid = true, showLabels = true;
let projection, path, baseScale;
let zoom;
const g = svg.append('g');
const gridG = g.append('g');
const landG = g.append('g');
const boundaryG = g.append('g');
const labelG = g.append('g');
const overlayG = g.append('g');

const regions = {
  all: null,
  hokkaido: [139, 44, 146, 42],
  honshu: [128, 42, 143, 33],
  shikoku: [132, 35, 135, 32],
  kyushu: [129, 34, 132, 30],
  okinawa: [121, 31, 132, 23],
  north: [140, 47, 149, 43]
};

function size(){ return [wrap.clientWidth, wrap.clientHeight]; }

function makeProjection(){
  const [w,h] = size();
  if(mode === 'equal'){
    projection = d3.geoEqualEarth().rotate([-centerLon,0,0]);
  }else{
    projection = d3.geoMercator().center([centerLon,36]).scale(1);
  }
  path = d3.geoPath(projection);
  const target = activeRegion === 'all' ? country : regionFeature(activeRegion);
  if(target) projection.fitExtent([[28,25],[w-28,h-28]], target);
  baseScale = projection.scale();
}

function regionFeature(name){
  if(!prefectures) return country;
  const b = regions[name];
  if(!b) return country;
  const [minLon,maxLat,maxLon,minLat] = [b[0],b[1],b[2],b[3]];
  const features = prefectures.features.filter(f => {
    const [lon,lat] = d3.geoCentroid(f);
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
  });
  return features.length ? {type:'FeatureCollection',features} : country;
}

function draw(){
  const [w,h] = size();
  makeProjection();
  gridG.selectAll('*').remove();
  landG.selectAll('*').remove();
  boundaryG.selectAll('*').remove();
  labelG.selectAll('*').remove();
  overlayG.selectAll('*').remove();

  if(showGrid){
    const graticule = d3.geoGraticule().step([10,10]);
    gridG.append('path').datum(graticule()).attr('class','grid-line').attr('d',path);
  }

  landG.append('path').datum(country).attr('class','land').attr('d',path);
  if(showPref && prefMesh) boundaryG.append('path').datum(prefMesh).attr('class','pref-boundary').attr('d',path);

  if(showLabels) drawLabels();
  drawScale(w,h);
  applyZoomReset();
  document.querySelector('#projectionLabel').innerHTML = mode === 'equal'
    ? `イコールアース<br><small>Equal Earth / ${centerLon}°E</small>`
    : `通常の地図<br><small>Mercator / ${centerLon}°E</small>`;
  document.querySelector('#centerLonValue').textContent = `${centerLon}°E`;
  document.querySelector('#scaleText').textContent = mode === 'equal' ? '正積図法：面積を保つ' : '比較用：メルカトル図法';
}

function drawLabels(){
  const labels = [
    ['北海道',142.8,43.5,'region-label'],
    ['本州',138.1,36.4,'region-label'],
    ['四国',133.5,33.7,'region-label'],
    ['九州',130.7,32.2,'region-label'],
    ['沖縄県',127.8,26.3,'region-label'],
    ['日本海',136.2,39.3,'ocean-label'],
    ['太平洋',151.0,34.0,'ocean-label'],
    ['東シナ海',124.8,29.0,'ocean-label'],
    ['オホーツク海',146.0,49.0,'ocean-label']
  ];
  labels.forEach(([text,lon,lat,cls])=>{
    const p = projection([lon,lat]);
    if(!p) return;
    labelG.append('text').attr('class',cls).attr('x',p[0]).attr('y',p[1]).attr('text-anchor','middle').text(text);
  });
  // Reference labels for the four northern islands. Their exact display is deliberately separated from administrative polygons.
  const north = [
    ['択捉島',147.1,45.0],['国後島',145.9,44.1],['色丹島',146.9,43.8],['歯舞群島',146.3,43.5]
  ];
  north.forEach(([text,lon,lat])=>{
    const p = projection([lon,lat]); if(!p) return;
    labelG.append('text').attr('class','territory-label').attr('x',p[0]+4).attr('y',p[1]).text(text);
  });
  const jp = projection([147.0,46.0]);
  if(jp){
    labelG.append('path').attr('class','north-bracket').attr('d',`M${jp[0]},${jp[1]} h18 v${Math.min(45,h/10)} h-18`);
    labelG.append('text').attr('class','territory-label').attr('x',jp[0]+25).attr('y',jp[1]+18).text('北方領土');
  }
}

function drawScale(w,h){
  const x=30, y=h-30, len=Math.max(90,Math.min(190,w*0.18));
  overlayG.append('line').attr('class','scale-line').attr('x1',x).attr('x2',x+len).attr('y1',y).attr('y2',y);
  [0,.5,1].forEach(t=>overlayG.append('line').attr('class','scale-line').attr('x1',x+len*t).attr('x2',x+len*t).attr('y1',y-5).attr('y2',y+5));
  overlayG.append('text').attr('class','scale-label').attr('x',x).attr('y',y-9).text('0');
  overlayG.append('text').attr('class','scale-label').attr('x',x+len/2).attr('y',y-9).attr('text-anchor','middle').text('500 km');
  overlayG.append('text').attr('class','scale-label').attr('x',x+len).attr('y',y-9).attr('text-anchor','end').text('1,000 km');
}

function applyZoomReset(){
  if(!zoom){
    zoom = d3.zoom().scaleExtent([0.65,12]).on('zoom', e=>g.attr('transform',e.transform));
    svg.call(zoom);
  }
  svg.call(zoom.transform,d3.zoomIdentity);
}

function updateRegionButtons(){
  document.querySelectorAll('[data-region]').forEach(b=>b.classList.toggle('active',b.dataset.region===activeRegion));
}

async function init(){
  try{
    topology = await d3.json(DATA_URL);
    country = topojson.feature(topology,topology.objects.country);
    prefectures = topojson.feature(topology,topology.objects.prefectures);
    prefMesh = topojson.mesh(topology,topology.objects.prefectures,(a,b)=>a!==b);
    loading.remove();
    draw();
  }catch(err){
    loading.textContent='地図データの読み込みに失敗しました。通信状態を確認してください。';
    console.error(err);
  }
}

document.querySelectorAll('input[name="projection"]').forEach(el=>el.addEventListener('change',e=>{mode=e.target.value;draw()}));
document.querySelector('#centerLon').addEventListener('input',e=>{centerLon=+e.target.value;draw()});
document.querySelector('#prefToggle').addEventListener('change',e=>{showPref=e.target.checked;draw()});
document.querySelector('#gridToggle').addEventListener('change',e=>{showGrid=e.target.checked;draw()});
document.querySelector('#labelsToggle').addEventListener('change',e=>{showLabels=e.target.checked;draw()});
document.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>{activeRegion=b.dataset.region;updateRegionButtons();draw()}));
document.querySelector('#resetBtn').addEventListener('click',()=>{activeRegion='all';updateRegionButtons();draw()});
document.querySelector('#zoomIn').addEventListener('click',()=>svg.transition().call(zoom.scaleBy,1.4));
document.querySelector('#zoomOut').addEventListener('click',()=>svg.transition().call(zoom.scaleBy,1/1.4));
window.addEventListener('resize',()=>draw());
init();
