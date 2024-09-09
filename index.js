require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require("mongoose");
const User = require("./models/User");

const mongourl = process.env.MONGO_URI;
const discordToken = process.env.DISCORD_TOKEN;
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

async function handleUnrecognizedCommand(messageContent) {
  try {
    const prompt = `User input: "${messageContent}". How should the bot respond?`;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    if (responseText.length > 2000) {
      return responseText.substring(0, 2000) + '...'; 
    } else {
      return responseText;
    }
  } catch (error) {
    console.error("Error with Gemini AI:", error);
    return "Sorry, I don't understand that command.";
  }
}

async function handleHelpCommand() {
  return `
**Available Commands:**
\`!ping\` - Responds with "Pong!".
\`!hello\` - Greets the user with a personalized message.
\`!rank\` - Displays the user's current points.
\`!joke\` - Fetches and displays a random joke.
\`!serverinfo\` - Provides information about the server.
\`!leaderboard\` - Shows the top 10 users with the most points.
\`!level\` - Displays the user's current level based on points.
\`!weather <city>\` - Provides the current temperature for the specified city.
\`!help\` - Displays this help message.

**AI Feature:**
If the bot doesn't recognize a command, it will use an AI model to generate a response based on the input. The AI model tries to understand and respond to unrecognized commands intelligently.

Use these commands to interact with the bot and explore its functionality!
  `;
}

async function main() {
  await mongoose.connect(mongourl);
  console.log("Connection successful");

  const fetch = (await import("node-fetch")).default;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.once("ready", () => {
    console.log("Bot is online!");
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    let user = await User.findOne({ userId: message.author.id });
    if (!user) {
      user = new User({
        userId: message.author.id,
        username: message.author.username,
      });
      await user.save();
    }

    user.points += 1;
    await user.save();

    if (message.content === "!ping") {
      message.channel.send("Pong!");
    } else if (message.content === "!hello") {
      message.channel.send(`Hey ${message.author.username}! 😄 What can I do for you today?`);
    } else if (message.content === "!rank") {
      message.channel.send(`${message.author.username}, you have ${user.points} points!`);
    } else if (message.content === "!joke") {
      try {
        const response = await fetch("https://official-joke-api.appspot.com/random_joke");
        const joke = await response.json();
        message.channel.send(`${joke.setup} - ${joke.punchline}`);
      } catch (error) {
        console.error(error);
        message.channel.send("Could not fetch a joke at this time.");
      }
    } else if (message.content === "!serverinfo") {
      const server = message.guild;
      const info = `
**Server Name:** ${server.name}
**Total Members:** ${server.memberCount}
**Total Channels:** ${server.channels.cache.size}
**Creation Date:** ${server.createdAt}
      `;
      message.channel.send(info);
    } else if (message.content === '!leaderboard') {
      const users = await User.find().sort({ points: -1 }).limit(10);
      const leaderboard = users.map((u, i) => `${i + 1}. ${u.username} - ${u.points} points`).join('\n');
      message.channel.send(`Leaderboard:\n${leaderboard}`);
    } else if (message.content === '!level') {
      const level = Math.floor(user.points / 100);
      message.channel.send(`${message.author.username}, you are at level ${level}.`);
    } else if (message.content.startsWith("!weather")) {
      const city = message.content.split(" ")[1];
      const apiKey = process.env.WEATHER_API_KEY;
      const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;

      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.cod === 200) {
          const temp = (data.main.temp - 273.15).toFixed(2);
          message.channel.send(`The current temperature in ${city} is ${temp}°C.`);
        } else {
          message.channel.send("City not found.");
        }
      } catch (error) {
        console.error(error);
        message.channel.send("Could not fetch the weather. Please try again later.");
      }
    } else if (message.content === '!help') {
      const helpMessage = await handleHelpCommand();
      message.channel.send(helpMessage);
    } else {
      const responseText = await handleUnrecognizedCommand(message.content);
      message.channel.send(responseText);
    }
  });

  client.login(discordToken);
}

main().catch((err) => {
  console.error(err);
});
