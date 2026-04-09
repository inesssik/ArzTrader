export const serversArr = [
  'Vice-City',
  'Phoenix',
  'Tucson',
  'Scottdale',
  'Chandler',
  'Brainburg',
  'SaintRose',
  'Mesa',
  'Red-Rock',
  'Yuma',
  'Surprise',
  'Prescott',
  'Glendale',
  'Kingman',
  'Winslow',
  'Payson',
  'Gilbert',
  'Show-Low',
  'Casa-Grande',
  'Page',
  'Sun-City',
  'Queen-Creek',
  'Sedona',
  'Holiday',
  'Wednesday',
  'Yava',
  'Faraway',
  'Bumble Bee',
  'Christmas',
  'Mirage',
  'Love',
  'Drake',
  'Space'
];

export function getServerName(serverId: number): string {
  if (serverId < 0 || serverId >= serversArr.length) {
    return 'Unknown';
  }
  return serversArr[serverId]!;
}
