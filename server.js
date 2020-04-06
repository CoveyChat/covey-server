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

    socket.on('bindtohost', function(obj) {
        console.log("Bound local connection for socket " + socket.id);
        obj.signalId = socket.id;
        console.log("Returning client the socket id of " + obj.signalId);
        var hostBound = false;
        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            //Skip the initiator socket
            if(clientSocket.id == socket.id || hostBound) {
                continue;
            }

            //This socket is already bound to you, don't be greedy
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id] != 'undefined'
                && typeof rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] != 'undefined'
                && typeof rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id].hostid  != 'undefined'
                && !rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id].hostid != obj.hostid
                ) {

                console.log("##TRIED TO SEND " + obj.hostid + " TO SOCKET " + clientSocket.id +
                " BUT ITS ALREADY BOUND TO " + rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id].hostid);

                continue;
            }

            //Init this socket activePeerHosts list
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id] == 'undefined') {
                rooms[socket.roomid].activePeerHosts[socket.id] = {clients:{}};
            }

            //Init this socket clients reference
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] == 'undefined') {
                rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] = {hostid: obj.hostid};
                console.log("SENDING");
                clientSocket.emit('initclient', obj);
                hostBound=true;
            }



            console.log("!!!!!SOMETHING WENT WRONG!!!!");

        }

    });


    socket.on('bindconnection', function(obj) {
        console.log("Bound local connection for socket " + socket.id);

        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            //Skip the initiator and any unready sockets
            if(clientSocket.id == socket.id) {
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
            rooms[roomid] = {id: roomid, clients:{}, activePeerHosts: {}};
        }

        rooms[roomid].clients[socket.id] = socket;
        rooms[roomid].clients[socket.id].roomid = roomid;

        console.log("+++ (" + (Object.keys(rooms[roomid].clients).length) + ")" + socket.id + " joined room " + roomid);

        var numConnections = Object.keys(rooms[roomid].clients).length;

        //Don't init the first connection since it has nowhere to go
        if(numConnections > 1) {
            socket.emit('inithosts', numConnections-1);
        }

    });

    socket.on('disconnect', function(){
        var roomid = socket.roomid;
        delete rooms[roomid].clients[socket.id];
        console.log("-- " + socket.id + ' disconnected from room ' + roomid);
    });
});

http.listen(1337, function(){
  console.log('listening on *:1337');
});