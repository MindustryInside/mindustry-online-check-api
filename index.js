const dgram = require("dgram");
const bd = require('pg').Client;

const express = require('express')
const https = require("https");

const app = express()
const port = 3000

const onlineDataServerRequestBuffer = Buffer.from([-2,1],0,2);

let timeStamp = Math.floor(Date.now()/5000)*5
let iplist = [];
let i = 0;

const base = new bd({
    host: "surus.db.elephantsql.com",
    user: process.env.DBUSER,
    password: process.env.DBPASSWORD,
    database: process.env.DBUSER,
})

base.connect()

base.query("CREATE TABLE IF NOT EXISTS storageofonline (" +
    "    id serial NOT NULL," +
    "    ipport text," +
    "    mapname text," +
    "    datestamp integer," +
    "    online integer," +
    "    servername text," +
    "    PRIMARY KEY (id)" +
    ")")

app.get('/', async (req, res) => {
    let output = []
    for (const l of iplist) {
        let baka = await generateOnlineArray(l);
        if (baka.data.length > 0) {
            output.push(baka)
        }
    }
    res.send(JSON.stringify(output))
})

app.listen(port, () => {
    console.log(`API listening on port ${port}`)
})

function uploadOnlineInfo(dataset){
    if(!iplist.includes(dataset[0])){
        iplist.push(dataset[0])
    }
    base.query('insert into storageofonline values (' +
        'default,\'' +
        dataset[0]+"\',\'" +
        dataset[2]+"\'," +
        timeStamp+"," +
        dataset[3]+",\'" +
        dataset[1]+"\')"
    )
}

let initServers = function(serverList){
    serverList.forEach(l=>{
        let s = l.split(":")
        if(!s[1]){
            s[1]=6567;
        }else{
            s[1]=Number(s[1])
        }
        generateThreadReader(s[0],s[1])
    })
    setInterval(()=>{
        timeStamp=Math.floor(Date.now()/5000)*5;
        base.query('delete from storageofonline where datestamp < '+(Math.floor(Date.now()/5000)*5 - (60*10)))
    },5000
    )
}

let generateThreadReader = function(ip,port){
    let connection = dgram.createSocket("udp4");
    connection.on('message',(message,info)=>{
        let i = 0;
        let s = JSON.parse(JSON.stringify(message));
        let offset = message.readInt8(i);
        let name = "";
        let map_name = "";
        i++;
        while (i <= offset) {
            name+=String.fromCharCode(s.data[i])
            i++
        }
        offset = message.readInt8(i)+i;
        i++;
        while (i <= offset) {
            map_name+=String.fromCharCode(s.data[i])
            i++
        }
        let online = message.readInt8(i+3)
        uploadOnlineInfo([info.address+':'+info.port,name,map_name,online])
    })
    setInterval(()=>
    connection.send(onlineDataServerRequestBuffer,port,ip,(error, bytes) => {
    }),5*1000)
    return connection;
}

https.get("https://raw.githubusercontent.com/Anuken/Mindustry/master/servers_v7.json",(res)=>{
    let data = [];
    res.on('data', chunk => {
        data.push(chunk);
    });
    res.on('end', () => {
        let serverList = []
        JSON.parse(Buffer.concat(data).toString())
            .forEach(a=>{
                try {
                    a.address.forEach(o => serverList.push(o))
                }catch (e){
                    serverList.push(a.address)
                }
            })
        console.log("parsed "+serverList.length+" servers")
        initServers(serverList)
    })
})

async function generateOnlineArray(serverIp){
    let s = serverIp.split(":")
    if(!s[1]){
        s[1]=6567;
    }else{
        s[1]=Number(s[1])
    }
    serverIp=s[0]+':'+s[1]
    let rtn = []
    let data = await base.query('select * from \"storageofonline\" where ipport =\''+serverIp+'\'');
    let ipport = serverIp;
    let servername = 'undefined';
    data.rows.forEach(r=>{
        ipport = r.ipport;
        servername = r.servername;
        rtn.push({map: r.mapname, online: r.online, time: r.datestamp})
    })
    return {serverIp: ipport,name: servername,data: rtn};
}