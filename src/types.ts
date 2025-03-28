export type MatchData = {
  participants: string[];
  oddsRow: string[];
  rankings: string[];
};

export type ResultMatchData = MatchData & {
  matchDate: string;
  matchWinner: 1 | 2;
  bothWonSet: 0 | 1;
};

export type ResultMatch = {
  matchDate: string;
  matchWinner: 1 | 2;
  bothWonSet: 0 | 1;
  firstPlayer: PlayerData;
  secondPlayer: PlayerData;
};

export type Match = {
  firstPlayer: PlayerData;
  secondPlayer: PlayerData;
};

export type PlayerData = {
  name: string;
  odds: string;
  atpRanking: string;
  lastMatches: {
    matchResult: string;
    matchDate: string;
    matchSurface: string;
    sets: string[];
    opponentName: string;
    opponentAtpRanking: string;
    selfOdds: string;
    opponentsOdds: string;
    win: number;
  }[];
};
