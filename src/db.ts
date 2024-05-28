const { MongoClient } = require("mongodb");

async function main() {
  // todo

  const uri =
    "mongodb+srv://sztulc130:uSW8kktRbLNGfaDL@poteznyprojekt.wlur4zi.mongodb.net/?retryWrites=true&w=majority&appName=PoteznyProjekt";

  const client = new MongoClient(uri);

  await client.connect();
}
