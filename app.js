const express = require('express');
const app = express();
const port = process.env.PORT || 3001;
const fs = require('fs');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const path = require('path')
const videoshow = require('videoshow')
const sharp = require('sharp');
const { OpenAIApi, Configuration } = require('openai');
const gTTS = require('gtts');
const cors = require('cors');
const dotenv = require('dotenv')
dotenv.config();
app.set('views', path.join(__dirname))
app.set('view engine', 'hbs')
app.use(express.json());
app.use(cors());

const accessKey = process.env.ACESSKEY;

const configuration = new Configuration({
    apiKey: process.env.OPENAIKEY
})
const openai = new OpenAIApi(configuration);
const script = `In the grand tapestry of life, challenges arise to test our strength and resilience. Embrace the power within, let your dreams ignite a fire that guides you through dark times. Success is not just a destination, but a journey fueled by determination. Draw inspiration from the beauty around you and let the mountains be a symbol of your aspirations. Together, we can climb to great heights, supporting and uplifting one another. Believe in yourself and create a world that knows no limits. Seize this one precious life with unwavering determination, leaving an indelible mark upon the world.`;

app.post('/getscript', async (req, res) => {
    const requestData = req.body.scripttopic;
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `Write a script in 100 words, on topic ${requestData} in the form of paragraph.`,
            temperature: 0.5,
            max_tokens: 150,
        });
        const data = response.data.choices[0].text.split('/n').map(line => line.trim()).filter(line => line !== '');
        const data1 = data.join(' ');
        res.json(data1);
    } catch (error) {
        res.json("Your credits are empty. Please contact us for more ai credits.")
    }
})

app.get('/api1', (req, res) => {
    res.json("Hello api is running.");
})

app.get('/',(req,res)=>{
    res.json("Server is running")
})



const fetchimg = async (word) => {
    try {
        const res = await fetch(`https://api.unsplash.com/search/photos?page=1&query=${word}&client_id=${accessKey}`);
        const data = await res.json();
        const images = data.results.slice(0, 1).map(result => result.urls.regular);
        return images;
    } catch (error) {
        console.log(error);
    }
};

function splitScript(script, chunkSize) {
    console.log(script);
    console.log("Spliting script...")
    const words = script.split(' ');
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize);
        chunks.push(chunk.join(' '));
    }
    return chunks;
}

const fetchscriptsimage = async (script) => {
    console.log("Fetching script images...")
    const allImages = [];
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `Write 10 words which describes this script in form of list : ${script}`,
            temperature: 0.6,
            max_tokens: 100,
        });
        const data = await response.data.choices[0].text;
        console.log(data);
        const words = data.split("\n");
        for (const word of words) {
            if (word.trim().length > 0) {
                const images = await fetchimg(word);
                allImages.push(...images);
            }
        }
        console.log("All Images are fetched");
        return allImages;
    } catch (error) {
        console.log(error);
    }
}

app.post('/api', async (req, res) => {
    const script = req.body.script;
    console.log('Received data from frontend:', script);
    const response = await fetchscriptsimage(script);
    console.log(response);
    const lines = splitScript(script, 10);
    console.log(lines);
    var gtts = new gTTS(script, 'en');
    await gtts.save('./audio.mp3', function (err, result) {
        if (err) { throw new Error(err) }
        console.log('Audio file is downloaded');
    });
    for (let i = 0; i < response.length; i++) {
        const imageUrl = response[i];
        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) {
            throw new Error(`Failed to download image. Status code: ${imageRes.status}`);
        }
        const fileName = `image${i}.jpg`;
        const imagePath = `./${fileName}`;
        await pipeline(imageRes.body, fs.createWriteStream(imagePath));
        console.log(`Image downloaded and saved at ${imagePath}`);
        sharp(`./image${i}.jpg`).resize(640, 360).toFile(`img${i}.jpg`);
        console.log("Image resized " + i)
    }
    var images = Array.from({ length: 10 }, (_, i) => ({
        path: `img${i}.jpg`,
        caption: lines[i]
    }));
    var videoOptions = {
        fps: 25,
        loop: 4, // seconds
        transition: true,
        transitionDuration: 1, // seconds
        videoBitrate: 1024,
        videoCodec: 'libx264',
        size: '640x?',
        audioBitrate: '128k',
        audioChannels: 2,
        format: 'mp4',
        pixelFormat: 'yuv420p',
        subtitleStyles: {
            "Fontname": "Verdana",
            "Fontsize": "26",
            "PrimaryColour": "11861244",
            "SecondaryColour": "11861244",
            "TertiaryColour": "11861244",
            "BackColour": "-2147483640",
            "Bold": "2",
            "Italic": "0",
            "BorderStyle": "2",
            "Outline": "2",
            "Shadow": "3",
            "Alignment": "1",
            "MarginL": "40",
            "MarginR": "60",
            "MarginV": "40"
        }
    }
    videoshow(images, videoOptions)
        .audio('audio.mp3')
        .save('video.mp4')
        .on('start', function (command) {
            console.log('ffmpeg process started:', command)
        })
        .on('error', function (err, stdout, stderr) {
            console.error('Error:', err)
            console.error('ffmpeg stderr:', stderr)
        })
        .on('end', function (output) {
            console.error('Video created in:', output);
            const videoPath = path.join(__dirname, 'video.mp4');
            const videoReadStream = fs.createReadStream(videoPath);
            res.setHeader('Content-Type', 'video/mp4'); // Set the correct content type
            videoReadStream.pipe(res);
        })
})

app.listen(port, (req, res) => {
    console.log(`Server is running at ${port}`);
})