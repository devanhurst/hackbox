export const generateRoomCode = () => {
  const consonants = [
    "B",
    "C",
    "D",
    "F",
    "G",
    "H",
    "J",
    "K",
    "L",
    "M",
    "N",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "V",
    "W",
    "X",
    "Z",
  ];
  return [1, 2, 3, 4]
    .map(() => consonants[Math.floor(Math.random() * consonants.length)])
    .join("");
};
