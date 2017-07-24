
var ConversationV1 = require('watson-developer-cloud/conversation/v1');
var request = require('request');
var NodeCache = require('node-cache');

var enablePromocionesApi = true;
var enableActividadesApi = true;

var workspaceid = 'REPLACE_THIS_VALUE'; //The workspaceId is the identifier of the conversation registered in Watson Conversation
var clientId = 'REPLACE_THIS_VALUE'; //The clientId is provided by API Connect, in order to identify the API consumer
var token = 'REPLACE_THIS_VALUE'; //This token is provided by Facebook Developers Program

var sessions = new NodeCache({ 
    stdTTL: 3600, 
    checkperiod: 1800 
});

var conversation = new ConversationV1({
    username: 'REPLACE_THIS_VALUE', // replace with username from service key
    password: 'REPLACE_THIS_VALUE', // replace with password from service key
    url: 'https://gateway.watsonplatform.net/conversation/api',
    version_date: ConversationV1.VERSION_DATE_2017_04_21
});


exports.dialog = function(req, res) {
    var messagingEvents = req.body.entry[0].messaging;
    for(var i=0; i < messagingEvents.length; i++) {
        var event = messagingEvents[i];
        var sender = event.sender.id;

        var conversationContext;
        var payload;
        if (event.message && event.message.text) {
            console.log('posted message --> ' + event.message.text);
            conversationContext = sessions.get(sender);
            console.log('watson response in the cache --> ' + JSON.stringify(conversationContext));
            if (conversationContext === undefined) {
                payload = {
                    workspace_id: workspaceid,
                    context: {},
                    input: {}
                };

                conversationContext = {
                    pollsParameters: {
                        age: null,
                        time_of_the_day: null,
                        weather: null,
                        city: null
                    },
                    data: null
                };

                conversation.message(payload, function(error, data) {
                    if(!error) {
                        console.log('conversation init --> ' + JSON.stringify(data));
                        conversationContext.data = data;
                        payload = {
                            workspace_id: workspaceid,
                            context: conversationContext.data.context,
                            input: {
                                text: event.message.text
                            }
                        };
                        conversation.message(payload, function(error, data) {
                            if (!error) {
                                console.log('conversation in progress cache recent --> ' + JSON.stringify(data));
                                sendTextMessage(sender, data.output.text[0]);
                                if (data.context.pregunta_promociones) {
                                    consultPromotions(sender, data);
                                    data.context.pregunta_promociones = false;
                                } 

                                if (data.context.pregunta_recomendaciones) {
                                    conversationContext = setConversationVariable(data, conversationContext);
                                    if(requirementComplete(conversationContext)) {
                                        consultEncuestas(sender, data, conversationContext);
                                        conversationContext = initConversationVariables(conversationContext);
                                        data.context.pregunta_recomendaciones = false;
                                    } 
                                }

                                conversationContext.data = data;   
                                sessions.set(sender, conversationContext, 600);
                            }
                        });

                    }
                });
                
            } else {
                payload = {
                    workspace_id: workspaceid,
                    context: conversationContext.data.context,
                    input: {
                        text: event.message.text
                    }
                };

                conversation.message(payload, function(error, data) {
                    if (!error) {
                        console.log('conversation in progress --> ' + JSON.stringify(data));
                        sendTextMessage(sender, data.output.text[0]);
                        if (data.context.pregunta_promociones) {
                            consultPromotions(sender, data);
                            data.context.pregunta_promociones = false;
                        }
                        if (data.context.pregunta_recomendaciones) {
                            conversationContext = setConversationVariable(data, conversationContext);
                            if(requirementComplete(conversationContext)) {
                                consultEncuestas(sender, data, conversationContext);
                                conversationContext = initConversationVariables(conversationContext);
                                data.context.pregunta_recomendaciones = false;
                            } 
                        } 

                        conversationContext.data = data;
                        sessions.set(sender, conversationContext, 600);    
                    }
                });
            }
        }       
    }
    res.sendStatus(200);
};

function consultPromotions(sender, data) {
    if (enablePromocionesApi) {
        var options = { 
                        method: 'GET',
                        url: 'https://api.au.apiconnect.ibmcloud.com/alfredolopezmx1ibmcom-poc/mis-sitios/promociones-api/promociones',
                        qs: { 
                            entidad: data.output.action.city 
                        },
                        headers:{ 
                            accept: 'application/json',
                            'x-ibm-client-id': clientId 
                        } 
                    };

        request(options, function (error, response, body) {
            if (error || body.httCode === "500") {
                sendTextMessage(sender, 'ocurrió un error en el sistema de promociones, vuelva a ponerse en contacto conmigo más tarde');
            } else {
                console.log('Success: ' + JSON.stringify(response));
                var newBody = JSON.parse(response.body);
                console.log('new body --> ' + JSON.stringify(newBody));
                var promociones = newBody.listado_promo;
                //console.log('Promo: ' + body.listado_promo[0].desc_promo);
                if (promociones.length <= 0 || !promociones.hasOwnProperty('length')) { 
                    sendTextMessage(sender, 'Lamentablemente no hay promociones para ' + data.output.action.city + ' en este momento, ¿hay algo más en lo que pueda ayudar?');
                } else {
                    sendTextMessage(sender, 'esto es lo que encontré');
                    //console.log('Promo --> ' + body.listado_promo[0].desc_promo);
                    for(var i=0; i < promociones.length; i++) {
                        sendTextMessage(sender, promociones[i].desc_promo);
                    }
                }
            }
        });
    }
}

function consultEncuestas(sender, data, conversationContext) {
    if (enableActividadesApi) {
        var options = { 
            method: 'GET',
            url: 'https://api.au.apiconnect.ibmcloud.com/alfredolopezmx1ibmcom-poc/mis-sitios/api/encuestas',
            qs: { 
                clima: conversationContext.pollsParameters.weather,
                localidad: conversationContext.pollsParameters.city,
                periodoDia: conversationContext.pollsParameters.time_of_the_day,
                edad: conversationContext.pollsParameters.age
            },
            headers:{ 
                accept: 'application/json',
                'x-ibm-client-id': clientId 
            } 
        };

        request(options, function(error, response, body) {
            if (error || body.httCode === "500") {
                sendTextMessage(sender, 'ocurrió un error en el sistema de encuestas, vuelva a ponerse en contacto conmigo más tarde');
            } else {
                console.log('Encuestas Success: ' + JSON.stringify(response));
                var result = JSON.parse(response.body);

                var registros = result.registros;
                var total = result.total;

                for (var i=0; i < registros.length; i++) {
                    var registro = registros[i];
                    var percentage = ((registro.NUMEROPERSONAS/total) * 100).toFixed(1);
                    var message = 'El ' + percentage + '% de los usuarios encuestados, respondió que realiza la actividad ' + registro.ACTIVIDAD;
                    sendTextMessage(sender, message);
                }

                sendTextMessage(sender, 'Esto fué lo que respondieron los usuarios encuestados');
            }
        });
    }
}

function sendTextMessage(sender, text) {
	var messageData = { 
        text: text 
    };
	
	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {
            access_token: token
        },
		method: 'POST',
		json: {
			recipient: {
                id: sender
            },
			message: messageData,
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending messages: ', error);
		} else if (response.body.error) {
			console.log('Error: ', response.body.error);
		}
	});
}

function requirementComplete(conversationContext) {
    var age = conversationContext.pollsParameters.age;
    var time_of_the_day = conversationContext.pollsParameters.time_of_the_day;
    var weather = conversationContext.pollsParameters.weather;
    var city = conversationContext.pollsParameters.city;
    console.log('age --> ' + age);
    console.log('time_of_the_day --> ' + time_of_the_day);
    console.log('weather --> ' + weather);
    console.log('city --> ' + city);
    console.log('requirementComplete() --> ' + ((age !== null) && (time_of_the_day !== null) && (weather !== null) && (city !== null)));
    return ((age !== null) && (time_of_the_day !== null) && (weather !== null) && (city !== null));
}

function setConversationVariable(data,conversationContext) {
    var action = data.output.action;

    if (action.hasOwnProperty('city')) {
        conversationContext.pollsParameters.city = action.city;
    } else if (action.hasOwnProperty('weather')) {
        conversationContext.pollsParameters.weather = action.weather;
    } else if (action.hasOwnProperty('time_of_the_day')) {
        conversationContext.pollsParameters.time_of_the_day = action.time_of_the_day;
    } else if (action.hasOwnProperty('age')) {
        conversationContext.pollsParameters.age = action.age;
    } 

    return conversationContext;
}

function initConversationVariables(conversationContext) {
    conversationContext.pollsParameters.city = null;
    conversationContext.pollsParameters.weather = null;
    conversationContext.pollsParameters.time_of_the_day = null;
    conversationContext.pollsParameters.age = null;

    return conversationContext;
}