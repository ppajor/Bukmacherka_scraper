const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
import { Browser, Page } from "puppeteer";
const fs = require("fs");

puppeteer.use(StealthPlugin());

const url = "https://www.flashscore.pl/tenis";

const main = async () => {
  const browser: Browser = await puppeteer.launch({ headless: false });
  console.log("Browser launched");
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForSelector(".event__match--scheduled", { timeout: 30000 });

  // Get match URLs
  const matchesUrls = await page.evaluate(() => {
    const urls = Array.from(
      document.querySelectorAll(".event__match--scheduled")
    ).map((match) => {
      const id = match.getAttribute("id").split("_")[2];
      return `https://www.flashscore.pl/mecz/${id}/#/szczegoly-meczu`;
    });
    return urls;
  });

  await page.waitForSelector("#onetrust-accept-btn-handler", {
    timeout: 15000,
  });
  await page.click("#onetrust-accept-btn-handler"); // Accept cookies
  console.log("matches length", matchesUrls.length);
  const allMatches = [];
  for (const matchUrl of matchesUrls.slice(0, 20)) {
    //testowo niech wyscapuje 20 pierwszych
    try {
      console.log("match url", matchUrl);
      await page.goto(matchUrl);

      await page.waitForSelector(".oddsValueInner", {
        timeout: 2500,
      });
      const rootData = await page.evaluate(() => {
        const participants = Array.from(
          document.querySelectorAll(".participant__participantNameWrapper")
        ).map((participant) => participant?.textContent);

        const oddsRow = Array.from(
          document.querySelectorAll(".oddsValueInner")
        );

        const atpRankings = Array.from(
          document.querySelectorAll(".participant__participantRank")
        );
        const [fNumber, sNumber] = atpRankings.map(
          (rank) => rank?.textContent.match(/\d+/)[0]
        );

        return {
          participants,
          oddsRow: oddsRow.map((odds) => odds?.textContent),
          rankings: [fNumber, sNumber],
        };
      });

      // h2h
      const h2hUrl = matchUrl.replace("szczegoly-meczu", "h2h/overall");

      await page.goto(h2hUrl);
      try {
        await page.waitForSelector(".h2h__row", { timeout: 2500 });
        await page.waitForSelector(".showMore", { timeout: 2500 });

        await page.click(".h2h .h2h__section:nth-child(1) .showMore");
        await page.click(".h2h .h2h__section:nth-child(2) .showMore");
      } catch (error) {
        console.log("error", error);
        continue;
      }

      let lastMatchesFirstPlayer = [];
      let lastMatchesSecondPlayer = [];

      for (let sectionIdx = 1; sectionIdx <= 2; sectionIdx++) {
        const h2hRowsCount = await page.evaluate((sectionIdx) => {
          const h2hRows = Array.from(
            document.querySelectorAll(
              `.h2h .h2h__section:nth-of-type(${sectionIdx}) .rows .h2h__row`
            )
          );
          return h2hRows.length;
        }, sectionIdx);

        console.log("Section index", sectionIdx);
        console.log("h2hRowsCount", h2hRowsCount);

        for (let h2hRowIndex = 0; h2hRowIndex < h2hRowsCount; h2hRowIndex++) {
          let newPageResolve: (value: Page | PromiseLike<Page>) => void;
          const newPagePromise = new Promise<Page>((resolve) => {
            newPageResolve = resolve;
          });

          const matchResultBoolean = await page.evaluate(
            (h2hRowIndex, sectionIdx) => {
              const result = document.querySelector(
                `.h2h .h2h__section:nth-of-type(${sectionIdx}) .rows .h2h__row:nth-of-type(${
                  h2hRowIndex + 1
                }) .h2h__icon`
              )?.textContent;
              return result === "Z" ? 1 : 0;
            },
            h2hRowIndex,
            sectionIdx
          );

          browser.on("targetcreated", async (target) => {
            if (target.type() === "page") {
              const newPage = await target.page();
              newPageResolve(newPage);
            }
          });

          console.log("h2hRowIndex", h2hRowIndex);
          await page.waitForSelector(".h2h__icon", { timeout: 2500 });

          await page.click(
            `.h2h .h2h__section:nth-of-type(${sectionIdx}) .rows .h2h__row:nth-of-type(${
              h2hRowIndex + 1
            })`
          );

          const lastMatchPage = await newPagePromise;
          try {
            await lastMatchPage.waitForSelector(".smh__home.smh__part--1", {
              timeout: 2500,
            });
            await lastMatchPage.waitForSelector(
              ".participant__participantNameWrapper",
              { timeout: 2500 }
            );
            await lastMatchPage.waitForSelector(".oddsValueInner", {
              timeout: 2500,
            });
          } catch (error) {
            console.log("Selector not found, moving on...");
          }

          const lastMatchData = await lastMatchPage.evaluate(
            (rootData, matchResultBoolean) => {
              const matchScore = document
                .querySelector(".detailScore__wrapper")
                ?.textContent.replace("-", ":");

              const participants = Array.from(
                document.querySelectorAll(
                  ".participant__participantNameWrapper"
                )
              ).map((participant) => participant?.textContent);
              const opponentName = participants.filter(
                (player) => player !== rootData.participants[0]
              )[0];

              const selfIndex =
                rootData.participants[0] === participants[0] ? 0 : 1;
              const opponentIndex =
                rootData.participants[0] === participants[0] ? 1 : 0;

              const oddsRow = Array.from(
                document.querySelectorAll(".oddsValueInner")
              );

              const selfOdds = oddsRow[selfIndex]?.textContent;
              const opponentsOdds = oddsRow[opponentIndex]?.textContent;

              const atpRankings = Array.from(
                document.querySelectorAll(".participant__participantRank")
              );
              const [fNumber, sNumber] = atpRankings.map(
                (rank) => rank?.textContent.match(/\d+/)[0]
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

              if (matchScore === ":") {
                // no score, most likely surrender
                return null;
              }

              return data;
            },
            rootData,
            matchResultBoolean
          );

          if (lastMatchData && sectionIdx === 1) {
            lastMatchesFirstPlayer.push(lastMatchData);
          }
          if (lastMatchData && sectionIdx === 2) {
            lastMatchesSecondPlayer.push(lastMatchData);
          }
          await lastMatchPage.close();
        }
      }

      console.log("lastMatchesFirstPlayer", lastMatchesFirstPlayer);
      console.log("lastMatcheSecondPlayer", lastMatchesSecondPlayer);

      const matchData = {
        firstPlayer: {
          name: rootData.participants[0],
          odds: rootData.oddsRow[0],
          atpRanking: rootData.rankings[0],
          lastMatches: lastMatchesFirstPlayer,
        },
        secondPlayer: {
          name: rootData.participants[1],
          odds: rootData.oddsRow[1],
          atpRanking: rootData.rankings[1],
          lastMatches: lastMatchesSecondPlayer,
        },
      };
      console.log("match", matchData);
      allMatches.push(matchData);
    } catch (error) {
      console.log("error", error);
    }
  }
  console.log("all matches", allMatches);
  const productionObject = {
    matches: allMatches,
  };
  const allMatchesJson = JSON.stringify(productionObject);
  fs.writeFile("matches.json", allMatchesJson, "utf8", (err: any) => {
    if (err) {
      console.log("Error writing file", err);
    } else {
      console.log("File has been written");
    }
  });
  await browser.close();
};

main();
