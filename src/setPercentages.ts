import * as fs from "fs";

interface FrequencyMap {
  [key: string]: number;
}

interface PercentageMap {
  [key: string]: string;
}

const sets = async (): Promise<void> => {
  fs.readFile(
    "./src/sets.json",
    "utf8",
    (error: NodeJS.ErrnoException | null, data: string) => {
      if (error) {
        console.log(error);
        return;
      }

      const results: string[] = JSON.parse(data);

      const normalizedResults: string[] = results.map((result) => {
        const [score1, score2] = result.split(":").map(Number);
        return score1 > score2 ? `${score1}:${score2}` : `${score2}:${score1}`;
      });

      const frequencyMap: FrequencyMap = normalizedResults.reduce(
        (acc: FrequencyMap, result: string) => {
          acc[result] = (acc[result] || 0) + 1;
          return acc;
        },
        {}
      );

      const totalSets: number = results.length;

      const percentageMap: PercentageMap = Object.entries(frequencyMap).reduce(
        (acc: PercentageMap, [key, value]: [string, number]) => {
          acc[key] = ((value / totalSets) * 100).toFixed(2) + "%";
          return acc;
        },
        {}
      );

      console.log(percentageMap);
    }
  );
};

sets();
