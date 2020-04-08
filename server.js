var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var request = require('request');

var rooms = {};
var api = {base: 'https://bevy.chat/'};

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
    var addToRoom = function(roomid, user) {
        rooms[roomid].clients[socket.id] = socket;
        rooms[roomid].clients[socket.id].roomid = roomid;
        console.log("+++ (" + (Object.keys(rooms[roomid].clients).length) + ")" + user.name + " joined room " + roomid);

        var numConnections = Object.keys(rooms[roomid].clients).length;
        socket.user = user;
        //Don't init the first connection since it has nowhere to go
        if(numConnections > 1) {
            socket.emit('inithosts', numConnections-1);
        }
    };

    var cleanUser = function(user) {
        return {name: user.name, verified: (user.id != null)};
    };

    console.log("+ new socket connected");

    socket.on('bindtohost', function(obj) {
        //Add the user details to the response object
        obj.user = cleanUser(socket.user);

        console.log("+++ bound local connection for socket " + socket.id + " and returning to client");
        obj.signalId = socket.id;
        //console.log("Returning client the socket id of " + obj.signalId);
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
                //console.log("##TRIED TO SEND " + obj.hostid + " TO SOCKET " + clientSocket.id +
                //" BUT ITS ALREADY BOUND TO " + rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id].hostid);
                continue;
            }

            //Init this socket activePeerHosts list
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id] == 'undefined') {
                rooms[socket.roomid].activePeerHosts[socket.id] = {clients:{}};
            }

            //Init this socket clients reference
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] == 'undefined') {
                rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] = {hostid: obj.hostid};
                console.log("+++ sending connection to initclient");
                clientSocket.emit('initclient', obj);
                hostBound=true;
            }

            if(!hostBound) {
                console.log("- No clients to bind this host to");
            }

        }

    });


    /**
     * Fires when a client has recieved the host connection
     * and is now sending it's own connection details to the host
     */
    socket.on('bindconnection', function(obj) {
        //Add the user details to the response object
        obj.user = cleanUser(socket.user);

        console.log("+++ bound local connection for socket " + socket.id);

        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            //Skip the initiator and any unready sockets
            if(clientSocket.id == socket.id) {
                continue;
            }

            console.log("+++ sending client bind to host " + clientSocket.id);
            clientSocket.emit('bindtoclient', obj);
        }

    });

    socket.on('join', function(obj){
        if(typeof obj.chatId == 'undefined') {
            return false;
        }
        var roomid = obj.chatId;
        var user = obj.user;

        //Init the room if it's new
        if(typeof rooms[roomid] == 'undefined') {
            rooms[roomid] = {id: roomid, clients:{}, activePeerHosts: {}};
        }

        if(user.token != null) {
            //Get the users details from their oAuth key. We don't trust the, to actually tell us their name / details
            request({
                url: api.base + 'api/1.0/users/whoami',
                headers: {
                    'Authorization': 'Bearer ' + user.token
                },
                rejectUnauthorized: false
            }, function(err, res) {
                if(err) {
                  return false;
                } else {

                    if(typeof res.body != 'undefined'
                        && typeof res.body === 'string'
                        && res.body != '') {
                        user = JSON.parse(res.body);
                    }

                    addToRoom(roomid, user.data);
                }

          });
        } else {
            //Send over an anon user
            addToRoom(roomid, {
                id: null,
                name: 'Anon Bird',
                token: null
            });
        }

    });

    socket.on('disconnect', function(){
        var roomid = socket.roomid;
        delete rooms[roomid].clients[socket.id];
        console.log("- " + socket.user.name + ' disconnected from room ' + roomid);
    });
});

http.listen(1337, function(){
  console.log('listening on *:1337');
});