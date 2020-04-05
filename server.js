var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var rooms = {};

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
    socket.hostConn = null;
    socket.remoteConn = null;

    console.log('+ ' + socket.id + " connected");
    io.emit('chat message', 'testing here a message from the server!~!!!');

    socket.on('setconnection', function(obj) {
        rooms[socket.roomid].clients[socket.id].hostConn = obj.webRtcId;
        rooms[socket.roomid].clients[socket.id].hostId = obj.hostid;

        console.log("Bound local connection for socket " + socket.id);

        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            //Skip the initiator socket
            if(clientSocket.id == socket.id) {
                continue;
            }

            clientSocket.emit('initclient', obj);
        }

    });


    socket.on('bindconnection', function(obj) {
        rooms[socket.roomid].clients[socket.id].clientConn = obj.webRtcId;
        rooms[socket.roomid].clients[socket.id].clientId = obj.clientId;

        console.log("Bound local connection for socket " + socket.id);

        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            //Skip the initiator and any unready sockets
            if(clientSocket.id == socket.id || clientSocket.hostConn == null) {
                //console.log("Skipped " + clientSocket.id + "  -  " + (clientSocket.hostConn == null ? "TRUE" : "FALSE"));
                continue;
            }
            console.log("Sending client bind to host " + clientSocket.id);
            clientSocket.emit('bindtoclient', obj);
        }

    });

    socket.on('join', function(roomid){
        //Init the room if it's new
        if(typeof rooms[roomid] == 'undefined') {
            rooms[roomid] = {id: roomid, clients:{}};
        }

        rooms[roomid].clients[socket.id] = socket;
        rooms[roomid].clients[socket.id].roomid = roomid;

        console.log("+++ (" + (Object.keys(rooms[roomid].clients).length) + ")" + socket.id + " joined room " + roomid);

        var numConnections = Object.keys(rooms[roomid].clients).length;

        //Don't init the first connection since it has nowhere to go
        for(var i=0;i<numConnections-1;i++) {
            socket.emit('inithosts', numConnections-1);
        }































/*
        //Notify all the other clients about the new connection
        if(Object.keys(rooms[roomid].clients).length > 0) {

            var openConnection = false;

            for(var clientId in rooms[roomid].clients) {
                var client = rooms[roomid].clients[clientId];

                //Exists but not ready connection
                if(client.hostConn == null) {
                    socket.emit('retry');
                    return false;
                }

                //Join any hosts
                console.log("Client with connectionstr: " + client.hostConn == null ? 'YES HAS A STRING' : 'NO STRING');
                if(client.hostConn != null && client.id != socket.id) {
                    console.log("~ Init Peer Conn to " + client.id);
                    socket.emit('initclient', client.hostConn);
                }

                //Tell all the clients in this room about a new peer
                //client.emit('inithost', client.webRtcId);
            }
        } else {
            console.log("~ Init Host Conn");
            //Become the first host
            socket.emit('inithost', null);
        }

        rooms[roomid].clients[socket.id] = socket;*/
    });

    //socket.on('setlocalconnection', function(webRtcId) {
    //    rooms[socket.roomid].clients[socket.id].hostConn = webRtcId;
    //    rooms[socket.roomid].clients[socket.id].remoteConn = null;
    //    console.log("Bound local connection for socket " + socket.id);

        //Announce to all the clients the new connection
        /*if(Object.keys(rooms[socket.roomid].clients).length > 0) {
            socket.emit('initclient', webRtcId);
        }*/
    //});


    //socket.on('setremoteconnection', function(webRtcId) {
    //    rooms[socket.roomid].clients[socket.id].remoteConn = webRtcId;
    //    console.log("Bound remote connection for socket " + socket.id);

        //Announce to all the clients the new connection
        /*if(Object.keys(rooms[socket.roomid].clients).length > 0) {
            socket.emit('initclient', webRtcId);
        }*/
    //});

    socket.on('disconnect', function(){
        var roomid = socket.roomid;
        delete rooms[roomid].clients[socket.id];
        console.log("-- " + socket.id + ' disconnected from room ' + roomid);
    });
});

http.listen(1337, function(){
  console.log('listening on *:1337');
});