"use strict";

/* --------- Globals --------- */
var map;
var nodes = [];    // each: Leaflet marker with .nodeID, .labelContent, .inPipes[], .outPipes[]
var pipes = [];    // each: Leaflet polyline with .pipeID, .origin, .destination
var sourceMarker = null;

/* --------- Init map --------- */
function initMapLeaflet(lat, lng, zoom) {
  map = L.map('map').setView([lat || 20.5937, lng || 78.9629], zoom || 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
}

/* --------- Marker handling --------- */
function createNodeIcon(name) {
  var html = '<div style="white-space:nowrap;padding:2px 4px;border-radius:3px;background:rgba(255,255,255,0.9);border:1px solid #777;font-size:12px;">' + (name||'') + '</div>';
  return L.divIcon({html:html,iconSize:[100,24],className:'custom-div-icon'});
}

function getNodeID() {
  var used = nodes.map(n=>n.nodeID);
  var id=1; while(used.includes(id)) id++;
  return id;
}

function addMarker(lat,lng,name,nodeID) {
  nodeID = nodeID || getNodeID();
  name = name || ('Node'+nodeID);
  var icon = createNodeIcon(name);
  var marker = L.marker([lat,lng],{draggable:true,icon:icon}).addTo(map);

  marker.nodeID=nodeID;
  marker.labelContent=name;
  marker.inPipes=[];
  marker.outPipes=[];
  marker.isesr=false;

  marker.on('dragend',function(){updateMarkerPipes(marker);});

  nodes.push(marker);
  return marker;
}

function updateMarkerPipes(marker){
  var pos=marker.getLatLng();
  marker.inPipes.forEach(function(pipe){
    var path=pipe.getLatLngs();
    path[path.length-1]=pos;
    pipe.setLatLngs(path);
  });
  marker.outPipes.forEach(function(pipe){
    var path=pipe.getLatLngs();
    path[0]=pos;
    pipe.setLatLngs(path);
  });
}

/* --------- Pipe handling --------- */
function getPipeID(){
  var used = pipes.map(p=>p.pipeID);
  var id=1; while(used.includes(id)) id++;
  return id;
}

function addPipe(originMarker,destMarker,coords){
  // coords optional; otherwise straight line
  coords = coords || [originMarker.getLatLng(),destMarker.getLatLng()];
  var polyline = L.polyline(coords,{color:'blue',weight:2}).addTo(map);
  polyline.origin=originMarker;
  polyline.destination=destMarker;
  polyline.pipeID=getPipeID();
  originMarker.outPipes.push(polyline);
  destMarker.inPipes.push(polyline);
  pipes.push(polyline);
  return polyline;
}

/* --------- Import/export JSON --------- */
function getNodesJSON(){
  return JSON.stringify(nodes.map(function(n){
    return {
      nodeid:n.nodeID,
      nodename:n.labelContent,
      latitude:n.getLatLng().lat,
      longitude:n.getLatLng().lng,
      isesr:n.isesr
    };
  }));
}

function getPipesJSON(){
  return JSON.stringify(pipes.map(function(p){
    var coords=p.getLatLngs().map(ll=>[ll.lat,ll.lng]);
    var encoded=window.polyline.encode(coords);
    return {
      encodedpath:encoded,
      originid:p.origin.nodeID,
      destinationid:p.destination.nodeID,
      length:computePolylineLength(coords)
    };
  }));
}

function loadNodesFromJSON(jsonString){
  var arr=JSON.parse(jsonString);
  arr.forEach(function(n){
    addMarker(parseFloat(n.latitude),parseFloat(n.longitude),n.nodename,parseInt(n.nodeid,10));
  });
}

function loadPipesFromJSON(jsonString){
  var arr=JSON.parse(jsonString);
  arr.forEach(function(p){
    var coords=window.polyline.decode(p.encodedpath).map(c=>[c[0],c[1]]);
    var origin=nodes.find(n=>n.nodeID==p.originid);
    var dest=nodes.find(n=>n.nodeID==p.destinationid);
    if(origin&&dest) addPipe(origin,dest,coords);
  });
}

/* --------- Geometry helpers --------- */
function computeDistance(lat1,lng1,lat2,lng2){
  return turf.distance([lng1,lat1],[lng2,lat2],{units:'kilometers'})*1000;
}

function computePolylineLength(coords){
  // coords array of [lat,lng]
  var line=turf.lineString(coords.map(c=>[c[1],c[0]]));
  return turf.length(line,{units:'kilometers'})*1000;
}

/* --------- Elevation --------- */
function getElevationForLocations(latlngArray,callback){
  // latlngArray: [ [lat,lng], [lat,lng], ...]
  // open-elevation: lat,lng|lat,lng
  var locs=latlngArray.map(c=>c[0]+','+c[1]).join('|');
  fetch('https://api.open-elevation.com/api/v1/lookup?locations='+locs)
  .then(r=>r.json())
  .then(j=>{
    if(j && j.results){
      var elevations=j.results.map(
