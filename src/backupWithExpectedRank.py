from pymongo.mongo_client import MongoClient
from datetime import datetime
import statistics
import csv
from datetime import date
import math

# Współczynniki do setów
WSet = {
    "6:0": 0.5, "6:1": 0.42, "6:2": 0.33, "6:3": 0.24,
    "6:4": 0.19, "7:5": 0.14, "7:6": 0.125, "0:6": 0.5,
    "1:6": 0.42, "2:6": 0.33, "3:6": 0.25, "4:6": 0.17,
    "5:7": 0.14, "6:7": 0.125
}
WSet5 = {
    "6:0": 0.30, "6:1": 0.25, "6:2": 0.23, "6:3": 0.16,
    "6:4": 0.13, "7:5": 0.095, "7:6": 0.075, "0:6": 0.30,
    "1:6": 0.25, "2:6": 0.23, "3:6": 0.17, "4:6": 0.11,
    "5:7": 0.095, "6:7": 0.075
}

# kod uri to połączenia z bazą danych
uri = "mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.2.6"


def save_to_csv(filename, players_data, nrMatch):
    # Nagłówki do pliku CSV
    headers = [
        "Match Number", "Player", "Coefficient", "Odds", "Rank", "Median",
        "MedianOdds", "Length", "Coefficient14Days", "Length14Days", "Median14", "ExpectedRank", "Opponent",
        "EnemyCoefficient", "EnemyOdds", "EnemyRank", "EnemyMedian",
        "EnemyMedianOdds", "EnemyLength", "EnemyCoefficient14Days", "EnemyLength14Days", "EnemyMedian14",
        "EnemyExpectedRank"
    ]

    # Otwórz plik CSV i zapisz dane
    with open(filename, mode='a', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)

        # Sprawdź, czy plik jest pusty i jeśli tak, zapisz nagłówki
        if file.tell() == 0:
            writer.writerow(headers)

        # Zapisz dane dla każdego gracza w meczu
        row = [nrMatch]  # Start with match number

        # Collect data for both players in a single row
        for player_name, data in players_data.items():
            row.extend([
                player_name, round(data['coefficient'], 3), data['odds'], data['ranking'],
                data['avOpponentRanking'], data['MedKurs'], data['lastMatchesNumber'],
                data['coefficient22'], data['length14'], data['ranking14'], data['expectedRank']
            ])

        # Write the complete row for both players
        writer.writerow(row)


# def check_score(result, win):
#     # Rozdzielamy string na dwie liczby
#     left, right = map(int, result.split(':'))
#
#     # Wybieramy wartość w zależności od zmiennej win
#     if win == 1:
#         value_to_check = left
#     else:
#         value_to_check = right
#
#     # Sprawdzamy, czy wartość jest większa od 0
#     if value_to_check > 0:
#         return 1
#     else:
#         return 0


def kurs(selfodds, opponent_odds, win):
    Kurs = 0
    if win == 0:
        if selfodds > opponent_odds:
            Kurs = (selfodds - opponent_odds) / (selfodds + opponent_odds)
        else:
            Kurs = -(opponent_odds - selfodds) / (selfodds + opponent_odds)

    elif win == 1:
        if selfodds > opponent_odds:
            Kurs = (selfodds - opponent_odds) / (selfodds + opponent_odds)
        else:
            Kurs = -(opponent_odds - selfodds) / (selfodds + opponent_odds)
    return Kurs


# Pingowanie bazy danych żeby sprawdzić czy jest połączenie
def connect():
    client = MongoClient(uri)
    try:
        client.admin.command('ping')
        print("Connected to MongoDB")
    except Exception as e:
        print(f"Connection failed: {e}")


def read():
    client = MongoClient(uri)
    db = client["admin"]
    collection = db["Match Days"]
    return collection


def dataWS(DataMeczu):
    now = datetime.now()
    dateFormat = "%d.%m.%y"
    date_obj = datetime.strptime(DataMeczu, dateFormat)
    roznica = now - date_obj
    dni = roznica.days

    waga = 1.3
    if dni > 60:
        waga = 0

    elif dni <= 60:
        for i in range(0, dni):
            waga -= 0.01
    # print("różnica dni: ",dni)
    return round(waga, 2)


def dataWS14(DataMeczu):
    now = datetime.now()
    dateFormat = "%d.%m.%y"
    date_obj = datetime.strptime(DataMeczu, dateFormat)
    roznica = now - date_obj
    dni = roznica.days

    if dni > 14:
        waga = 0

    elif dni <= 14:
        waga = 1
    # print("różnica dni: ",dni)
    return round(waga, 2)


# szacowanie rankingu na podstawie mediany kursów i mediany rankingów opponentów

def calculate_expected_rank(median_odds, median_ranks):
    if median_odds <= 1.80:
        odds_diff = (1.80 - median_odds) * 100
        rank_diff_coefficient = 1 - round(odds_diff / 80, 2)
        expected_rank = round(median_ranks * rank_diff_coefficient, 2)
        return expected_rank
    else:
        odds_diff = (median_odds - 1.80) * 100
        rank_diff_coefficient = round(odds_diff / 80, 2)
        expected_rank = round(median_ranks + (median_ranks * rank_diff_coefficient), 1)
        return expected_rank


# obliczanie współczynników kondycji gracza licząc tylko wygrane i przegrane sety
def calculate_wspolczynnik(sety, result, win):
    wynik = sum(WSet.get(set, 0) for set in sety)
    wynik2 = sum(WSet5.get(set, 0) for set in sety)
    winning_sets = 0
    losing_sets = 0
    if win == 0:
        if result == "2:0":
            return -wynik
        elif result == "0:2":
            return -wynik
        elif result == "2:1":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet.get(set)
                else:
                    losing_sets += WSet.get(set)
            return (losing_sets - (winning_sets * 2)) / 3
        elif result == "1:2":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet.get(set)
                else:
                    losing_sets += WSet.get(set)

            return (winning_sets - (losing_sets * 2)) / 3

        elif result == "3:0":
            return -wynik2
        elif result == "0:3":
            return -wynik2
        elif result == "3:1":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)
            return (losing_sets - (winning_sets * 3)) / 4
        elif result == "1:3":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)

            return (winning_sets - (losing_sets * 3)) / 4

        elif result == "3:2":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)
            return (losing_sets - (winning_sets * 3)) / 5
        elif result == "2:3":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)

            return (winning_sets - (losing_sets * 3)) / 5



    elif win == 1:

        if result == "2:0":
            return wynik
        elif result == "0:2":
            return wynik
        elif result == "2:1":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet.get(set)
                else:
                    losing_sets += WSet.get(set)
            return ((winning_sets * 2) - losing_sets) / 3
        elif result == "1:2":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet.get(set)
                else:
                    losing_sets += WSet.get(set)
            return ((losing_sets * 2) - winning_sets) / 3

        elif result == "3:0":
            return wynik2
        elif result == "0:3":
            return wynik2
        elif result == "3:1":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)
            return ((winning_sets * 3) - losing_sets) / 4
        elif result == "1:3":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)
            return ((losing_sets * 3) - winning_sets) / 4

        elif result == "3:2":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)
            return ((winning_sets * 3) - losing_sets) / 5
        elif result == "2:3":
            for set in sety:

                if set == "6:0" or set == "6:1" or set == "6:2" or set == "6:3" or set == "6:4" or set == "7:5" or set == "7:6":
                    winning_sets += WSet5.get(set)
                else:
                    losing_sets += WSet5.get(set)
            return ((losing_sets * 3) - winning_sets) / 5

    return 0


# wizualna prezentacja setów wraz z wyciągnieciem danych i wyliczeniem współczynników
# funkcja read_sets korzysta z calculate_wspolczynnik
def read_sets(collection, player_key):
    for document in collection.find():
        matches = document.get("matches", [])
        for match in matches:
            player = match.get(player_key)
            opponent = match.get("firstPlayer") if player_key == "secondPlayer" else match.get("secondPlayer")

            player_name = player.get("name")
            player_rank = player.get("atpRanking")
            player_odds = player.get("odds")
            opponent_name = opponent.get("name")

            print(f"Imię: {player_name}")
            print(f"Ranking: {player_rank}")
            print(f"Kurs: {player_odds}")
            print(f"Imię rywala: {opponent_name}")

            last_matches = player.get("lastMatches", [])
            ws_gracza = 0

            SumWinSet = 0
            dziel = len(last_matches)
            for number, lastmatch in enumerate(last_matches, start=1):
                opponent_name = lastmatch.get("opponentName")

                result = lastmatch.get("matchResult")
                opponent_rank = lastmatch.get("opponentAtpRanking")
                sety = lastmatch.get("sets", [])
                win = lastmatch.get("win")
                DataMeczu = lastmatch.get("matchDate")

                print("____________________________________________")
                print(f"Mecz: {number}")
                print(f"Name: {opponent_name}")
                print(f"Ranking: {opponent_rank}")
                print(f"Wynik: {result}")
                print(f"Rezultat meczu: {win}")
                print(f"Sety: {sety}")
                print(f"Data meczu: {DataMeczu}")
                selfodds = lastmatch.get("selfOdds")
                opponent_odds = lastmatch.get("opponentsOdds")
                selfodds_f = float(selfodds)
                opponent_odds_f = float(opponent_odds)
                WSKursu = kurs(selfodds_f, opponent_odds_f, win)
                # WS_WinSet=check_score(result,win)
                waga = dataWS(DataMeczu)
                print(waga)
                # SumWinSet+=WS_WinSet
                wspolczynnik = ((calculate_wspolczynnik(sety, result, win) + WSKursu) * waga)
                if wspolczynnik == 0 or -0:
                    dziel -= 1

                print("ilosc meczy: ", dziel)

                ws_gracza += wspolczynnik
                print(f"Współczynnik gry: {wspolczynnik:.4f}")

            print(f"Suma setów: ", SumWinSet)
            print(f"Współczynnik gracza: {round(ws_gracza, 3) / 2}")


def display_pairs_with_coefficients(collection):
    filename = 'match_results.csv'  # Nazwa pliku CSV
    for document in collection.find():
        matches = document.get("matches", [])
        nrMatch = 1
        for match in matches:
            print("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~")
            print("match nr: ", nrMatch)
            nrMatch += 1
            players_data = {}

            players_data2 = {}
            match_data = {}
            first_player_data = {}
            second_player_data = {}
            skip_match = False  # Flag to check if we should skip this match

            for player_key in ["firstPlayer", "secondPlayer"]:
                player = match.get(player_key)

                player_name = player.get("name")
                last_matches = player.get("lastMatches", [])
                total_coefficient = 0
                total_coefficient2 = 0
                roznica = 0
                roznica2 = 0
                opponent_atp_rankings = []
                oddsy = []
                rank14 = []
                odds14 = []
                for lastmatch in last_matches:

                    result = lastmatch.get("matchResult")
                    sety = lastmatch.get("sets", [])
                    win = lastmatch.get("win")
                    DataMeczu = lastmatch.get("matchDate")
                    waga = dataWS(DataMeczu)
                    waga2 = dataWS14(DataMeczu)
                    selfodds = lastmatch.get("selfOdds")
                    opponent_odds = lastmatch.get("opponentsOdds")
                    opponent_ranking = lastmatch.get("opponentAtpRanking") or None

                    # WS_WinSet = check_score(result, win)
                    # SumWinSet += WS_WinSet
                    selfodds_f = float(selfodds)

                    if opponent_ranking is not None:
                        opponent_atp_rankings.append(int(opponent_ranking))
                    if selfodds is not None:
                        oddsy.append(float(selfodds))

                    opponent_odds_f = float(opponent_odds)
                    WSKursu = kurs(selfodds_f, opponent_odds_f, win)
                    coefficient = (calculate_wspolczynnik(sety, result, win) + WSKursu) * waga
                    coefficient2 = (calculate_wspolczynnik(sety, result, win) + WSKursu) * waga2

                    if coefficient == 0 or -0:
                        roznica += 1

                    if coefficient2 == 0 or -0:
                        roznica2 += 1

                    total_coefficient += coefficient
                    total_coefficient2 += coefficient2
                    rank14Check = dataWS14(DataMeczu)

                    if rank14Check != 0:
                        rank14.append(int(opponent_ranking))
                        rank14Finally = statistics.median(rank14)
                    if selfodds != 0:
                        odds14.append(float(selfodds))
                        oddsfinally = round(statistics.median(odds14), 2)

                dzielnik = len(last_matches) - roznica
                dzielnik2 = len(last_matches) - roznica2

                if dzielnik2 > 0:
                    dniWSP = round((total_coefficient2 / dzielnik2) / 2, 3)


                else:
                    dniWSP = " brak meczy w ciągu 14 dni"
                    oddsfinally = 0
                    rank14Finally = 0

                if dzielnik <= 3:
                    print(f"SKIP MATCH NR: {nrMatch - 1}")
                    skip_match = True
                    break

                players_data[player_name] = {
                    'coefficient': (total_coefficient / dzielnik) / 2,
                    'ranking': player.get('atpRanking'),
                    'odds': player.get('odds'),
                    'avOpponentRanking': statistics.median(opponent_atp_rankings),
                    'lastMatchesNumber': dzielnik,
                    'coefficient22': dniWSP,
                    'length14': dzielnik2,
                    'ranking14': rank14Finally,
                    'MedKurs': round(statistics.median(oddsy), 2),
                    'Oddsy14': oddsfinally,
                    'expectedRank': calculate_expected_rank(round(statistics.median(oddsy), 2),
                                                            statistics.median(opponent_atp_rankings))

                }

                first_player_data = {
                    'coefficient': (total_coefficient / dzielnik) / 2,
                    'ranking': player.get('atpRanking'),
                    'odds': player.get('odds'),
                    'avOpponentRanking': statistics.median(opponent_atp_rankings),
                    'lastMatchesNumber': dzielnik,
                    'coefficient22': dniWSP,
                    'length14': dzielnik2,
                    'ranking14': rank14Finally,
                    'MedKurs': round(statistics.median(oddsy), 2),
                    'Oddsy14': oddsfinally,
                    'expectedRank': calculate_expected_rank(round(statistics.median(oddsy), 2),
                                                            statistics.median(opponent_atp_rankings))
                }
                second_player_data = {
                    'enemyCoefficient': (total_coefficient / dzielnik) / 2,
                    'enemyRanking': player.get('atpRanking'),
                    'enemyOdds': player.get('odds'),
                    'enemyAvOpponentRanking': statistics.median(opponent_atp_rankings),
                    'enemyLastMatchesNumber': dzielnik,
                    'enemyCoefficient22': dniWSP,
                    'enemyLength14': dzielnik2,
                    'enemyRanking14': rank14Finally,
                    'enemyMedKurs': round(statistics.median(oddsy), 2),
                    'enemyOddsy14': oddsfinally,
                    'enemyexpectedRank': calculate_expected_rank(round(statistics.median(oddsy), 2),
                                                                 statistics.median(opponent_atp_rankings))
                }

            if skip_match:
                continue  # Skip the rest of this match and move to the next one

            save_to_csv(filename, players_data, nrMatch - 1)
            for player_name, data in players_data.items():
                print("                                                     ")
                print(
                    f"Player: {player_name}, Coefficient: {data['coefficient']:.3f}, Odds: {data['odds']}, Rank: {data['ranking']}, "
                    f"Median: {data['avOpponentRanking']}, MedianOdds: {data['MedKurs']}, ExpectedRank: {data['expectedRank']}, length: {data['lastMatchesNumber']},")
                print(
                    f"Coefficient 14 days: {data['coefficient22']}, length: {data['length14']}, Median: {data['ranking14']}")
                print("                                                     ")


# MedianOdds: {data['Oddsy14']}


# Przykłady użycia:


if __name__ == '__main__':
    connect()
    collection = read()
    print(collection)
    # read_sets(collection, "firstPlayer")
    # read_sets(collection, "secondPlayer")
    display_pairs_with_coefficients(collection)

