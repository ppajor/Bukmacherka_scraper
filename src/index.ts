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
  await page.click(".calendar__navigation--tomorrow");
  await page.waitForSelector(".event__match--scheduled", { timeout: 30000 });

  //matchesUrls
  const matchesUrls = await page.evaluate(() => {
    const urls = Array.from(
      document.querySelectorAll(".event__match--scheduled")
    ).map((match) => {
      const id = match.getAttribute("id").split("_")[2];
      return `https://www.flashscore.pl/mecz/${id}/#/szczegoly-meczu`;
    });
    return urls;
  });

  await page.click("#onetrust-accept-btn-handler"); //cookie accept
  await page.goto(matchesUrls[0]);

  const rootData = await page.evaluate(() => {
    const participants = Array.from(
      document.querySelectorAll(".participant__participantName > a")
    ).map((participant) => participant?.innerHTML);

    const oddsRow = Array.from(document.querySelectorAll(".oddsValueInner"));

    const atpRankings = Array.from(
      document.querySelectorAll(".participant__participantRank")
    );
    const [fNumber, sNumber] = atpRankings.map(
      (rank) => rank.textContent.match(/\d+/)[0]
    );

    return {
      participants,
      oddsRow: oddsRow.map((odds) => odds.textContent),
      rankings: [fNumber, sNumber],
    };
  });

  //h2h
  const h2hUrl = matchesUrls[0].replace("szczegoly-meczu", "h2h/overall");

  await page.goto(h2hUrl);
  await page.waitForSelector(".h2h__row", { timeout: 30000 });

  const matchResultBoolean = await page.evaluate(() => {
    //utils do switchowania wynikow setow
    const result = document.querySelector(".h2h__icon")?.textContent;
    return result === "L" ? 0 : 1;
  });

  const h2hRowsCount = await page.evaluate(() => {
    const h2hRows = Array.from(document.querySelectorAll(".h2h__row"));
    return h2hRows.length;
  });

  //catch new window open
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

  await page.click(".h2h__row");

  //last matches
  const lastMatchPage = await newPagePromise;
  await lastMatchPage.waitForSelector(".smh__home.smh__part--1", {
    timeout: 30000,
  });

  const lastMatchData = await lastMatchPage.evaluate(
    (rootData, matchResultBoolean) => {
      const matchScore = document
        .querySelector(".detailScore__wrapper")
        ?.textContent.replace("-", ":");

      const participants = Array.from(
        document.querySelectorAll(".participant__participantName > a")
      ).map((participant) => participant?.innerHTML);
      const opponentName = participants.filter(
        (player) => player !== rootData.participants[0]
      )[0];

      const selfIndex = rootData.participants[0] === participants[0] ? 0 : 1;
      const opponentIndex =
        rootData.participants[0] === participants[0] ? 1 : 0;

      const oddsRow = Array.from(document.querySelectorAll(".oddsValueInner"));
      const selfOdds = oddsRow[selfIndex].textContent;
      const opponentsOdds = oddsRow[opponentIndex].textContent;

      const atpRankings = Array.from(
        document.querySelectorAll(".participant__participantRank")
      );
      const [fNumber, sNumber] = atpRankings.map(
        (rank) => rank.textContent.match(/\d+/)[0]
      );
      const rankings = [fNumber, sNumber];
      const opponentAtpRanking = rankings.filter(
        (rank) => rank !== rootData.rankings[0]
      )[0];

      const set1Home = document.querySelector(".smh__home.smh__part--1")
        ?.textContent[0];
      const set1Away = document.querySelector(".smh__away.smh__part--1")
        ?.textContent[0];
      const set1 = set1Home + ":" + set1Away;

      const set2Home = document.querySelector(".smh__home.smh__part--2")
        ?.textContent[0];
      const set2Away = document.querySelector(".smh__away.smh__part--2")
        ?.textContent[0];
      const set2 = set2Home + ":" + set2Away;

      const set3Home = document.querySelector(".smh__home.smh__part--3")
        ?.textContent[0];
      const set3Away = document.querySelector(".smh__away.smh__part--3")
        ?.textContent[0];
      let set3;
      if (set3Home || set3Away) {
        set3 = set3Home + ":" + set3Away;
      } else {
        set3 = null;
      }
      const sets = [set1, set2, set3].filter((set) => !!set);

      const data = {
        matchResult: matchScore,
        sets,
        opponentName,
        opponentAtpRanking,
        selfOdds,
        opponentsOdds,
        win: matchResultBoolean,
      };

      return data;
    },
    rootData,
    matchResultBoolean
  );

  console.log("lastMatchesData", lastMatchData);

  // const fLastMatches = {
  //   result: matchScoreValid,

  // };

  const match = {
    firstPlayer: {
      name: rootData.participants[0],
      odds: rootData.oddsRow[0],
      atpRanking: rootData.rankings[0],
    },
    secondPlayer: {
      name: rootData.participants[1],
      odds: rootData.oddsRow[1],
      atpRanking: rootData.rankings[1],
    },
  };

  console.log("match", match);

  await browser.close();
};

main();
