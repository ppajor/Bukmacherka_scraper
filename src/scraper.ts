const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
import {
  Browser,
  Page,
  DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
} from "puppeteer";
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");

const fs = require("fs");

puppeteer.use(StealthPlugin());
puppeteer.use(
  AdblockerPlugin({
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  })
);

const url = "https://www.flashscore.pl/tenis";

function daysFromDate(dateStr: string) {
  // Parse the input date string
  const [day, month, year] = dateStr.split(".").map(Number);
  // Create a Date object for the input date
  const inputDate: any = new Date(Number(`20${year}`), month - 1, day);

  // Get today's date
  const today: any = new Date();

  // Calculate the difference in time (in milliseconds)
  const timeDifference = today - inputDate;

  // Convert the time difference from milliseconds to days
  const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

  return daysDifference;
}

const main = async () => {
  const browser: Browser = await puppeteer.launch({ headless: false });
  console.log("Browser launched");
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForSelector(".calendar__navigation--tomorrow", {
    timeout: 30000,
  });

  /* HACK */
  await page.click(".calendar__navigation--tomorrow"); //tommorow matches
  //await page.waitForSelector(".tv-ico", { timeout: 30000 }); //hack - jesli nie ma klasy tv icon w danym dniu a jest w nastepnym

  await page.waitForSelector("#onetrust-accept-btn-handler", {
    timeout: 15000,
  });
  await page.click("#onetrust-accept-btn-handler"); // Accept cookies

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

  console.log("matches length", matchesUrls.length);
  const allMatches = [];
  const allSetsResults = [];
  await page.exposeFunction("dateCounter", daysFromDate);

  for (const matchUrl of matchesUrls) {
    try {
      console.log("match url", matchUrl);
      await page.goto(matchUrl);

      await page.waitForSelector(".wcl-oddsValue_mpszX", {
        timeout: 2500,
      });

      const rootData = await page.evaluate(() => {
        const participants = Array.from(
          document.querySelectorAll(".participant__participantNameWrapper")
        ).map((participant) => participant?.textContent);

        const oddsRow = Array.from(
          document.querySelectorAll(".wcl-oddsValue_mpszX")
        );

        const atpRankings = Array.from(
          document.querySelectorAll(".participant__participantRank")
        );
        const [fNumber, sNumber] = atpRankings.map(
          (rank) => rank?.textContent.match(/\d+/)[0]
        );

        const oddsRowValues = oddsRow.map((odds) => odds?.textContent);
        if (
          !oddsRowValues[0] ||
          !oddsRowValues[1] ||
          !fNumber ||
          !sNumber ||
          oddsRowValues[0] === "-" ||
          oddsRowValues[1] === "-"
        )
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

      /* h2h */
      const h2hUrl = matchUrl.replace("szczegoly-meczu", "h2h/overall");

      await page.goto(h2hUrl);
      await page.evaluate(() => {
        if (!window.location.href.includes("isDetailPopup=true")) {
          window.history.replaceState(
            null,
            "",
            window.location.href.replace("#", "?isDetailPopup=true#")
          );
        }
      });
      try {
        await page.waitForSelector(".h2h__row", { timeout: 2500 });
        await page.waitForSelector(".showMore", { timeout: 2500 });

        await page.click(".h2h .h2h__section:nth-child(1) .showMore");
        await page.click(".h2h .h2h__section:nth-child(1) .showMore");
        await page.click(".h2h .h2h__section:nth-child(1) .showMore");
        await page.click(".h2h .h2h__section:nth-child(2) .showMore");
        await page.click(".h2h .h2h__section:nth-child(2) .showMore");
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

        for (let h2hRowIndex = 0; h2hRowIndex < h2hRowsCount; h2hRowIndex++) {
          let newPageResolve: (value: Page | PromiseLike<Page>) => void;
          const newPagePromise = new Promise<Page>((resolve) => {
            newPageResolve = resolve;
          });

          const matchRowData = await page.evaluate(
            async (h2hRowIndex, sectionIdx) => {
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
              //@ts-ignore
              const isLatestMatch = await window?.dateCounter(matchDate);

              const rowData = {
                matchResultBoolean: result === "Z" ? 1 : 0,
                matchDate,
                matchSurface: surface,
                isInLast60Days: isLatestMatch < 60 ? true : false,
              };

              return rowData;
            },
            h2hRowIndex,
            sectionIdx
          );

          const {
            matchResultBoolean,
            matchDate,
            matchSurface,
            isInLast60Days,
          } = matchRowData;

          if (!isInLast60Days) {
            continue;
          }

          //h2h row click
          browser.on("targetcreated", async (target) => {
            if (target.type() === "page") {
              const newPage = await target.page();
              newPageResolve(newPage);
            }
          });

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
            await lastMatchPage.waitForSelector(".wcl-oddsValue_mpszX", {
              timeout: 2500,
            });
          } catch (error) {
            console.log("Selector not found, moving on...");
          }

          const lastMatchData = await lastMatchPage.evaluate(
            (
              rootData,
              matchResultBoolean,
              matchDate,
              matchSurface,
              sectionIdx
            ) => {
              const validMatchScores = [
                "0:2",
                "1:2",
                "2:1",
                "2:0",
                "3:0",
                "0:3",
                "3:1",
                "1:3",
                "3:2",
                "2:3",
              ];
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

              const selfIndex =
                rootData.participants[sectionIdx - 1] === participants[0]
                  ? 0
                  : 1;
              const opponentIndex = selfIndex === 0 ? 1 : 0;
              const opponentName = participants[opponentIndex];

              const oddsRow = Array.from(
                document.querySelectorAll(".wcl-oddsValue_mpszX")
              );

              const selfOdds = oddsRow[selfIndex]?.textContent;
              const opponentsOdds = oddsRow[opponentIndex]?.textContent;

              const atpRankings = Array.from(
                document.querySelectorAll(".participant__participantRank")
              );
              const atpRankingsTextContent = atpRankings.map(
                (rank) => rank?.textContent.match(/\d+/)[0]
              );

              const opponentAtpRanking =
                atpRankingsTextContent.length === 2
                  ? atpRankingsTextContent[opponentIndex]
                  : null;

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

              const set4Home = document.querySelector(".smh__home.smh__part--4")
                ?.textContent[0];
              const set4Away = document.querySelector(".smh__away.smh__part--4")
                ?.textContent[0];
              let set4;
              if (set4Home || set4Away) {
                set4 = set4Home + ":" + set4Away;
              } else {
                set4 = null;
              }

              const set5Home = document.querySelector(".smh__home.smh__part--5")
                ?.textContent[0];
              const set5Away = document.querySelector(".smh__away.smh__part--5")
                ?.textContent[0];
              let set5;
              if (set5Home || set5Away) {
                set5 = set5Home + ":" + set5Away;
              } else {
                set5 = null;
              }

              const sets = [set1, set2, set3, set4, set5].filter(
                (set) => !!set
              );

              if (
                //if there is no proper data or data not valid, don't add this match
                !selfOdds ||
                selfOdds === "-" ||
                !opponentsOdds ||
                opponentsOdds === "-" ||
                !opponentAtpRanking ||
                !sets ||
                sets.length === 0 ||
                !validSetScores.includes(set1) ||
                !validSetScores.includes(set2) ||
                (set3 && !validSetScores.includes(set3)) ||
                (set4 && !validSetScores.includes(set4)) ||
                (set5 && !validSetScores.includes(set5))
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
            matchSurface,
            sectionIdx
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
    const timestamp = new Date().toISOString().replace(/[-:Z]/g, "");
    fs.writeFile(
      `matches_${timestamp}.json`,
      allMatchesJson,
      "utf8",
      (err: any) => {
        if (err) {
          console.log("Error writing file", err);
        } else {
          console.log("File has been written");
        }
      }
    );

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
