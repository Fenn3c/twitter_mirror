const config = require('./config.json');
const Twitter = require('twitter-v2');
const axios = require('axios');
const urlExpander = require('expand-url');
require('dotenv').config()

function expand(url) {
    return new Promise((resolve, reject) => {
        urlExpander.expand(url, (err, expandedUrl) => {
            if(expandedUrl){
                resolve(expandedUrl)
            } else{
                resolve(url)
            }
        })
    })
}

async function replaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
        const promise = asyncFn(match, ...args);
        promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());

}


const client = new Twitter({
    bearer_token: process.env.BEARER_TOKEN
});

async function sendMessage(tweet) {
    replaceAsync(tweet.text, /(https:\/\/t.co\/\S+)/mg, expand).then((result) => {
        axios.post(config.discordWebhook, { "content": result, "embeds": null, "attachments": [] })
    })
    console.log(tweet)
}

async function listenForever(streamFactory, dataConsumer) {
    try {
        for await (const { data } of streamFactory()) {
            dataConsumer(data);
        }
        // The stream has been closed by Twitter. It is usually safe to reconnect.
        console.log('Stream disconnected healthily. Reconnecting.');
        listenForever(streamFactory, dataConsumer);
    } catch (error) {
        // An error occurred so we reconnect to the stream. Note that we should
        // probably have retry logic here to prevent reconnection after a number of
        // closely timed failures (may indicate a problem that is not downstream).
        console.warn('Stream disconnected with error. Retrying.', error);
        listenForever(streamFactory, dataConsumer);
    }
}


async function setup() {
    const endpointParameters = {
        'tweet.fields': ['author_id', 'conversation_id'],
        'expansions': ['author_id', 'referenced_tweets.id'],
        'media.fields': ['url']
    }
    try {
        console.log('setting up')
        const body = {
            'add': [
                { 'value': `from:${config.twitterUser}` }
            ]
        }
        const r = await client.post('tweets/search/stream/rules', body)
        console.log(r)
    } catch (err) {
        console.log(err)
    }
    listenForever(
        () => client.stream('tweets/search/stream', endpointParameters),
        (data) => sendMessage(data)
    );
}


setup()