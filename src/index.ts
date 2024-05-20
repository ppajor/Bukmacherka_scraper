const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
import { Browser, Page } from "puppeteer";

puppeteer.use(StealthPlugin());

const url = "https://www.flashscore.pl/tenis";
//const url = "https://bot.sannysoft.com/";

const main = async () => {
  const browser: Browser = await puppeteer.launch({ headless: false });
  console.log("Browser launched");
  const page = await browser.newPage();
  await page.goto(url);

  const urls = await page.evaluate(() => {
    const matchesUrls = Array.from(
      document.querySelectorAll(".event__match--scheduled")
    ).map((match) => {
      const id = match.getAttribute("id").split("_")[2];
      return `https://www.flashscore.pl/mecz/${id}/#/szczegoly-meczu`;
    });
    return matchesUrls;
  });

  console.log("urls", urls);
  await page.goto(urls[0]);
  //await page.goto("https://www.flashscore.pl/mecz/faNRIvBF/#/szczegoly-meczu");
  await page.click("#onetrust-accept-btn-handler");

  const teamsData = await page.evaluate(() => {
    const participants = Array.from(
      document.querySelectorAll(".participant__participantName > a")
    ).map((participant) => participant?.innerHTML);

    const oddsRow = Array.from(document.querySelectorAll(".oddsValueInner"));

    let rankDiv = Array.from(
      document.querySelectorAll(".participant__participantRank")
    );

    let fTextContent = rankDiv[0].textContent;
    let sTextContent = rankDiv[1].textContent;

    let fNumber = fTextContent.match(/\d+/)[0];
    let sNumber = sTextContent.match(/\d+/)[0];

    return {
      participants,
      oddsRow: oddsRow.map((odds) => odds.textContent),
      rankings: [fNumber, sNumber],
    };
  });

  const page2 = await browser.newPage();

  const transformedUrl = urls[0].replace("szczegoly-meczu", "h2h/overall");

  await page2.goto(transformedUrl);

  const h2hRowsCount = await page2.evaluate(() => {
    const h2hRows = Array.from(document.querySelectorAll(".h2h__row"));
    return h2hRows.length;
  });
  console.log("h2hRows", h2hRowsCount);

  const matchResult = await page2.evaluate(() => {
    const result = document.querySelector(".h2h__icon")?.textContent;
    return result;
  });
  console.log("matchResult", matchResult);
  let newPageResolve: (value: Page | PromiseLike<Page>) => void;
  const newPagePromise = new Promise<Page>((resolve) => {
    newPageResolve = resolve;
  });

  browser.on("targetcreated", async (target) => {
    if (target.type() === "page") {
      const newPage = await target.page();
      newPageResolve(newPage);
    }
  });

  await page2.click(".h2h__row");

  // Get the new page
  const newPage = await newPagePromise;
  await newPage.waitForSelector(".smh__home.smh__part--1", { timeout: 30000 });

  const setsResults = await newPage.evaluate(() => {
    const set1Home = document.querySelector(
      ".smh__home.smh__part--1"
    )?.textContent;
    const set1Away = document.querySelector(
      ".smh__away.smh__part--1"
    )?.textContent;
    const set1 = set1Home + ":" + set1Away;

    const set2Home = document.querySelector(
      ".smh__home.smh__part--1"
    )?.textContent;
    const set2Away = document.querySelector(
      ".smh__away.smh__part--1"
    )?.textContent;
    const set2 = set2Home + ":" + set2Away;

    const set3Home = document.querySelector(
      ".smh__home.smh__part--1"
    )?.textContent;
    const set3Away = document.querySelector(
      ".smh__away.smh__part--1"
    )?.textContent;
    const set3 = set3Home + ":" + set3Away;

    const sets = [set1, set2, set3];
    return sets;
  });
  console.log("sets", setsResults);

  //console.log("lastMatchesData", lastMatchesData);

  const fLastMatches = {
    result: matchResult,
  };

  const match = {
    firstPlayer: {
      name: teamsData.participants[0],
      odds: teamsData.oddsRow[0],
      atpRanking: teamsData.rankings[0],
    },
    secondPlayer: {
      name: teamsData.participants[1],
      odds: teamsData.oddsRow[1],
      atpRanking: teamsData.rankings[1],
    },
  };

  console.log("match", match);

  await browser.close();
};

main();
