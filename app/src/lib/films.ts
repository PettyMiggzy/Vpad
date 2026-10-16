// The films the splash plays (components/Splash.tsx). With more than one, each time the splash plays it shows the next one, in turn,
// so a visitor who comes back sees the other. To add one: cut its files with `brand/splash/make-assets.sh <source film> -2` (the
// suffix names the files) and add a line below.
/** `ratio` is the cut file's width divided by its height: the splash sizes the film to fit the screen without cropping it */
export interface Film { src: string; poster: string; ratio: number }

export const FILMS: Film[] = [
  { src: '/splash/warheadz-splash.mp4', poster: '/splash/warheadz-splash-poster.webp', ratio: 3 / 4 },
];

/** The index of the film to play after the one played last (null or garbage when none is remembered): the next one, wrapping round */
export function nextFilm(count: number, last: number | null): number {
  if (!Number.isInteger(count) || count < 2) return 0;
  if (last === null || !Number.isInteger(last) || last < 0 || last >= count) return 0;
  return (last + 1) % count;
}
