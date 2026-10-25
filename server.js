const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static("public"));

const rooms = new Map();

const QUESTIONS = [
  {claim:"Solar photovoltaic panels can still generate electricity on cloudy days.",answer:true,topic:"Solar Energy",explanation:"Real evidence. PV panels can use diffuse sunlight, although output is generally lower than under strong direct sunlight.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026"},
  {claim:"Wind turbines only generate electricity when the sky is completely clear.",answer:false,topic:"Wind Energy",explanation:"Bluff. Wind turbines are driven by wind, not sunshine. Cloud cover is not what determines whether they can generate electricity.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026"},
  {claim:"Hydropower is considered renewable because the water cycle continually replenishes water resources.",answer:true,topic:"Hydropower",explanation:"Real evidence. Hydropower uses water naturally replenished through the water cycle, although projects can still have environmental impacts.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026"},
  {claim:"Hydrogen is automatically a zero-carbon fuel regardless of how it is produced.",answer:false,topic:"Hydrogen",explanation:"Bluff. Hydrogen contains no carbon, but producing it can create significant greenhouse-gas emissions depending on the production pathway and energy source.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-hydrogen-review-2024"},
  {claim:"Renewable sources supplied about one-third of global electricity generation in 2025.",answer:true,topic:"Global Energy",explanation:"Real evidence. The IEA reports that renewables reached about 34% of global electricity generation in 2025.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026/electricity-supply"},
  {claim:"A battery is a primary energy source in the same way that sunlight or wind is.",answer:false,topic:"Energy Storage",explanation:"Bluff. A battery is an energy-storage technology. It stores energy supplied from another source and later releases it as electricity.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026"},
  {claim:"Carbon dioxide is a greenhouse gas.",answer:true,topic:"Climate Science",explanation:"Real evidence. CO₂ absorbs and re-emits infrared radiation and is an important greenhouse gas in Earth's atmosphere.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026/co2-emissions"},
  {claim:"Renewable energy means an energy source has absolutely no environmental impact.",answer:false,topic:"Sustainability",explanation:"Bluff. Renewable technologies use naturally replenished resources, but manufacturing, construction and operation can still have environmental impacts.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026"},
  {claim:"Solar PV and wind accounted for the majority of new renewable capacity added globally in 2025.",answer:true,topic:"Renewable Growth",explanation:"Real evidence. Solar PV accounted for more than three-quarters of new renewable capacity and wind for about one-fifth.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026/technology-solar-pv-and-wind"},
  {claim:"If a technology produces no CO₂ while operating, its entire life cycle must also have zero greenhouse-gas emissions.",answer:false,topic:"Life-Cycle Science",explanation:"Bluff. Operational emissions and life-cycle emissions are different. Manufacturing, construction, transport and end-of-life stages can also contribute emissions.",source:"International Energy Agency",url:"https://www.iea.org/reports/global-energy-review-2026"},
  {claim:"Geothermal energy can use heat from inside Earth to produce useful energy.",answer:true,topic:"Geothermal",explanation:"Real evidence. Geothermal systems harness naturally occurring heat within the Earth for heating and, in suitable conditions, electricity generation.",source:"International Energy Agency",url:"https://www.iea.org/reports/geothermal"},
  {claim:"Energy efficiency is not related to sustainability because it does not create new energy.",answer:false,topic:"Energy Efficiency",explanation:"Bluff. Using less energy for the same service can reduce fuel use, costs and associated environmental impacts.",source:"International Energy Agency",url:"https://www.iea.org/topics/energy-efficiency"},
];

function code(){
  let c;
  do { c = crypto.randomBytes(3).toString("hex").toUpperCase(); } while(rooms.has(c));
  return c;
}
function cleanName(n){ return String(n||"Player").trim().slice(0,18)||"Player"; }
function send(ws,obj){ if(ws.readyState===1) ws.send(JSON.stringify(obj)); }
function broadcast(room,obj){
  const payload=JSON.stringify(obj);
  room.players.forEach(p=>send(p.ws,obj));
}
function stateFor(room, viewerId){
  const q = room.questions[room.round-1];
  return {
    type:"state", code:room.code, status:room.status, round:room.round,
    totalRounds:5, hostId:room.hostId, selfId:viewerId,
    question: (room.status==="playing"||room.status==="results") ? {
      claim:q.claim, topic:q.topic
    }:null,
    reveal:room.reveal,
    players:[...room.players.values()].map(p=>({
      id:p.id,name:p.name,score:p.score,answered:p.answer!==null
    })),
    winner:room.winner
  };
}
function sync(room){ room.players.forEach(p=>send(p.ws,stateFor(room,p.id))); }
function startGame(room){
  room.status="playing"; room.round=1; room.reveal=null; room.winner=null;
  room.questions=QUESTIONS.slice().sort(()=>Math.random()-.5).slice(0,5);
  room.players.forEach(p=>p.answer=null);
  sync(room);
}
function resolve(room){
  if(room.status!=="playing")return;
  const all=[...room.players.values()].every(p=>p.answer!==null);
  if(!all)return;
  const q=room.questions[room.round-1], points=room.round===5?200:100;
  room.players.forEach(p=>{if(p.answer===q.answer)p.score+=points;});
  room.status="results";
  room.reveal={correct:q.answer,explanation:q.explanation,source:q.source,url:q.url};
  sync(room);
}
function next(room){
  if(room.round>=5){
    room.status="finished";
    const ps=[...room.players.values()], high=Math.max(...ps.map(p=>p.score));
    room.winner=ps.filter(p=>p.score===high).map(p=>p.name);
  }else{
    room.round++; room.status="playing"; room.reveal=null;
    room.players.forEach(p=>p.answer=null);
  }
  sync(room);
}
function removePlayer(room,id){
  room.players.delete(id);
  if(!room.players.size){rooms.delete(room.code);return;}
  if(room.hostId===id) room.hostId=room.players.keys().next().value;
  sync(room);
}

app.get("/health",(req,res)=>res.json({ok:true,rooms:rooms.size}));
app.get("*",(req,res)=>res.sendFile(require("path").join(__dirname,"public","index.html")));

wss.on("connection",(ws)=>{
  ws.id=crypto.randomUUID();
  ws.room=null;

  ws.on("message",(raw)=>{
    let m; try{m=JSON.parse(raw)}catch{return send(ws,{type:"error",message:"Invalid message."});}
    if(m.action==="create"){
      const name=cleanName(m.name), c=code();
      const room={code:c,hostId:ws.id,status:"lobby",round:0,questions:[],reveal:null,winner:null,players:new Map()};
      room.players.set(ws.id,{id:ws.id,name,score:0,answer:null,ws});
      rooms.set(c,room); ws.room=c;
      sync(room);
      return;
    }
    const room=rooms.get(String(m.code||"").toUpperCase());
    if(!room)return send(ws,{type:"error",message:"Room not found."});
    if(m.action==="join"){
      if(room.status!=="lobby")return send(ws,{type:"error",message:"This game has already started."});
      if(room.players.size>=8)return send(ws,{type:"error",message:"Room is full."});
      const name=cleanName(m.name);
      room.players.set(ws.id,{id:ws.id,name,score:0,answer:null,ws}); ws.room=room.code; sync(room); return;
    }
    const p=room.players.get(ws.id);
    if(!p)return send(ws,{type:"error",message:"You are not in this room."});
    if(m.action==="start"){
      if(ws.id!==room.hostId)return send(ws,{type:"error",message:"Only the host can start."});
      if(room.players.size<2)return send(ws,{type:"error",message:"At least 2 players are required."});
      startGame(room);
    }else if(m.action==="answer"){
      if(room.status!=="playing"||p.answer!==null)return;
      p.answer=!!m.value; sync(room); resolve(room);
    }else if(m.action==="next"){
      if(ws.id!==room.hostId||room.status!=="results")return;
      next(room);
    }else if(m.action==="leave"){ removePlayer(room,ws.id); ws.room=null; }
  });
  ws.on("close",()=>{if(ws.room){const r=rooms.get(ws.room);if(r)removePlayer(r,ws.id);}});
});

server.listen(PORT,()=>console.log(`Green Truth listening on ${PORT}`));
