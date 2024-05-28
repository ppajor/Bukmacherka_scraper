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
  await page.waitForSelector(".calendar__navigation--tomorrow", {
    timeout: 30000,
  });
  await page.click(".calendar__navigation--tomorrow"); //tommorow matches

  await page.waitForSelector("#onetrust-accept-btn-handler", {
    timeout: 15000,
  });
  await page.click("#onetrust-accept-btn-handler"); // Accept cookies

  await page.waitForSelector(".event__match--scheduled", { timeout: 30000 });
  await page.waitForSelector(".tv-ico", { timeout: 30000 }); //hack - jesli nie ma klasy tv icon w danym dniu a jest w nastepnym

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

  console.log("matches length", matchesUrls.length);
  const allMatches = [];
  const allSetsResults = [];
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

        const oddsRowValues = oddsRow.map((odds) => odds?.textContent);
        if (!oddsRowValues[0] || !oddsRowValues[1] || !fNumber || !sNumber)
          return null;

        return {
          participants,
          oddsRow: oddsRowValues,
          rankings: [fNumber, sNumber],
        };
      });

      if (!rootData) {
        // if there is no crucial data, continue to next match
        continue;
      }
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

          const matchRowData = await page.evaluate(
            (h2hRowIndex, sectionIdx) => {
              const result = document.querySelector(
                `.h2h .h2h__section:nth-of-type(${sectionIdx}) .rows .h2h__row:nth-of-type(${
                  h2hRowIndex + 1
                }) .h2h__icon`
              )?.textContent;
              const matchDate = document.querySelector(
                `.h2h .h2h__section:nth-of-type(${sectionIdx}) .rows .h2h__row:nth-of-type(${
                  h2hRowIndex + 1
                }) .h2h__date`
              )?.textContent;
              const surface = document
                .querySelector(
                  `.h2h .h2h__section:nth-of-type(${sectionIdx}) .rows .h2h__row:nth-of-type(${
                    h2hRowIndex + 1
                  }) .surface`
                )
                ?.getAttribute("title");

              const rowData = {
                matchResultBoolean: result === "Z" ? 1 : 0,
                matchDate,
                matchSurface: surface,
              };

              return rowData;
            },
            h2hRowIndex,
            sectionIdx
          );

          const { matchResultBoolean, matchDate, matchSurface } = matchRowData;

          //h2h row click
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
            (rootData, matchResultBoolean, matchDate, matchSurface) => {
              const validMatchScores = ["0:2", "1:2", "2:1", "2:0"];
              const validSetScores = [
                "6:0",
                "0:6",
                "6:1",
                "1:6",
                "6:2",
                "2:6",
                "6:3",
                "3:6",
                "6:4",
                "4:6",
                "7:5",
                "5:7",
                "7:6",
                "6:7",
              ];

              const matchScore = document
                .querySelector(".detailScore__wrapper")
                ?.textContent.replace("-", ":");

              if (!validMatchScores.includes(matchScore)) {
                // if not valid score return null
                return null;
              }

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

              if (
                //if there is no proper data or data not valid, don't add this match
                !selfOdds ||
                !opponentsOdds ||
                !sets ||
                sets.length === 0 ||
                !validSetScores.includes(set1) ||
                !validSetScores.includes(set2) ||
                !validSetScores.includes(set3)
              ) {
                return null;
              }

              const data = {
                matchResult: matchScore,
                matchDate,
                matchSurface,
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
            matchResultBoolean,
            matchDate,
            matchSurface
          );

          if (lastMatchData?.sets) {
            allSetsResults.push(...lastMatchData.sets);
          }
          if (lastMatchData && sectionIdx === 1) {
            //if lastMatch data returned null, it's not included in array
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
      //console.log("match", matchData);
      allMatches.push(matchData);
    } catch (error) {
      console.log("error", error);
    }
  }
  //  console.log("all matches", allMatches);
  const productionObject = {
    matches: allMatches,
  };

  if (allMatches.length >= 1) {
    //write to file only if there are any results
    const allMatchesJson = JSON.stringify(productionObject);

    fs.writeFile("matches.json", allMatchesJson, "utf8", (err: any) => {
      if (err) {
        console.log("Error writing file", err);
      } else {
        console.log("File has been written");
      }
    });

    const allSetsJson = JSON.stringify(allSetsResults);

    fs.writeFile("sets.json", allSetsJson, "utf8", (err: any) => {
      if (err) {
        console.log("Error writing file", err);
      } else {
        console.log("File has been written");
      }
    });
  }
  await browser.close();
};

main();
