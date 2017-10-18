const dotenv = require('dotenv').config();
const express = require('express');
const request = require('request-promise');
const bodyParser = require('body-parser');
const imageMixer = require('./image');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static('public'));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

let userSelectedImage = 'https://cdn.shopify.com/s/files/1/1462/0734/products/1_800x_fb4264c3-eeb8-447a-a272-4c3655b176bf.jpg?v=1508255086';
let userUploadedFace = undefined;

app.get('/', (req, res) => {
  res.status(200).send('👙🤖');
});

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VERIFY_TOKEN) {
    console.log('Webhook validated');
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error('Failed validation. Make sure the validation tokens match.');
    res.sendStatus(403);
  }
  res.status(400);
});

app.post('/webhook', function (req, res) {
  const data = req.body;
  // Make sure this is a page subscription
  if (data.object && data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;
      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        console.log(event);
        if (event.message) {
          receivedMessage(event);
        } else if (event.postback) {
          receivedPostback(event);
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });
    return res.sendStatus(200);
  }

  return res.status(400).send('Not a webhook request');
  
});

// Set Express to listen out for HTTP requests
const server = app.listen(process.env.PORT || 3000, function () {
  console.log('Listening on port %s', server.address().port);
});

async function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {

    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText.toLowerCase()) {
      case 'generic':
        await addDelay(senderID);
        sendGenericMessage(senderID);
        break;
      case 'yes':
        sendTextMessage(senderID, '💃🏼');
        await addDelay(senderID);
        sendTextMessage(senderID, 'Here are a few options');
        const shopifyData = await callShopifyApi();
        await addDelay(senderID);
        await sendGenericMessage(senderID, shopifyData);
        break;
      case 'no':
        await addDelay(senderID);
        sendTextMessage(senderID, '😭');
        await addDelay(senderID);
        sendTextMessage(senderID, 'Okay, goodbye!');
        await addDelay(senderID, false, 3000);
        sendTextMessage(senderID, '👻');
        break;
      case 'bye':
        sendTextMessage(senderID, 'BYE');
        await addDelay(senderID, false, 3000);
        sendTextMessage(senderID, '👻');
        break;

      default:
        // await sendGenericMessage(senderID).catch(e => { return; } );
        const name = JSON.parse(await request(`https://graph.facebook.com/v2.6/${senderID}?fields=first_name&access_token=${PAGE_ACCESS_TOKEN}`));
        sendTextMessage(senderID, `Hi ${name.first_name}`);
        await addDelay(senderID);
        sendTextMessage(senderID, 'Would you like to try something on?');
    }
  } else if (messageAttachments) {
    await addDelay(senderID);
    sendTextMessage(senderID, '🔥');
    await addDelay(senderID);
    sendGeneratedImage(senderID, messageAttachments);
    
  }
}

async function sendGeneratedImage(senderID, messageAttachments) {
  const base = userSelectedImage;
  const face = messageAttachments[0].payload.url; 
  userUploadedFace = face;
  const remixed = await imageMixer(base, face);
  const remixedUrl = `http://dev-c-demo.ngrok.io/images/${remixed}`;
  sendImageMessage(senderID, remixedUrl);
}


async function sendGenericMessage(recipientId, data) {
  return new Promise(async (resolve) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: data,
          }
        }
      }
    };  
    await callSendAPI(messageData);
    resolve();
  })
}

async function callShopifyApi() {
  return new Promise(async (resolve, reject) => {
    const auth = {
      'user': SHOPIFY_API_KEY,
      'pass': SHOPIFY_API_SECRET,
    };    
    shopifyData = await request('https://ping-pong-shop-2.myshopify.com/admin/products.json', { 
      auth,
    }).catch(e => {console.log(e)});
    
    const products = JSON.parse(shopifyData).products;
    
    const data = products.map(product => {
      return {
        title: product.title,
        image_url: product.image.src,
        item_url: product.image.src,
        buttons: [{
          type: "postback",
          title: "Try this",
          payload: product.image.src,
        }],
      }
    });
    resolve(data);
  })
}

async function addDelay(recipientId, withTyping = true, duration = 500) {
  return new Promise(async (resolve) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      sender_action: "typing_on",    
    };
    if (withTyping) {
      await callSendAPI(messageData)
    }
    
    setTimeout(async () => {
      withTyping? await callSendAPI(messageData) : null;
      resolve();
    }, duration)
  })
}


async function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  await callSendAPI(messageData);
}

async function sendImageMessage(recipientId, url) {
  console.log(recipientId, url);
  var messageData = {
    recipient: {
      id: recipientId
    },
    "message":{
      "attachment":{
        "type":"template",
        "payload":{
          "template_type":"generic",
          "elements":[
             {
              "title":"Outfit simulator",
              "image_url":url,
              "default_action": {
                "type": "web_url",
                "url": url,
              },
              buttons: [{
                type: "postback",
                title: "Buy now!",
                payload: "buy-now",
              }],                  
            }
          ],
        }
      }
    }
   
  };
  // console.log(messageData);
  await callSendAPI(messageData);
}

async function callSendAPI(messageData) {
  return new Promise((resolve, reject) => {
    request({
      uri: 'https://graph.facebook.com/v2.6/me/messages',
      qs: { access_token: PAGE_ACCESS_TOKEN },
      method: 'POST',
      json: messageData
  
    })
    .then(response => {
      resolve()
    })
    .catch(e => {
      console.log('unable to make API call');
      console.log(e);
    })
  })
}

async function receivedPostback(event) {
  const senderID = event.sender.id;
  const recipientID = event.recipient.id;
  const timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  userSelectedImage = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, userSelectedImage, timeOfPostback);


  if (userUploadedFace) {
    await addDelay(senderID);
    sendTextMessage(senderID, '🌶');      
    const remixed = await imageMixer(userSelectedImage, userUploadedFace);
    const remixedUrl = `https://dev-c-demo.ngrok.io/images/${remixed}`;
    return sendImageMessage(senderID, remixedUrl);
  
  }
  await addDelay(senderID);
  sendTextMessage(senderID, 'Great choice 😍');
  await addDelay(senderID);
  await addDelay(senderID);        
  sendTextMessage(senderID, 'Send me your face please');
  sendTextMessage(senderID, '🤳🏼');
}
