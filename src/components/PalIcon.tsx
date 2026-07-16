import { pals } from "../lib/data";

interface Props {
  /** Index de l'espèce dans la liste des pals. */
  pal: number;
  size?: number;
}

/** Icône ronde d'un pal (masquée si l'image manque). */
export default function PalIcon({ pal, size = 22 }: Props) {
  return (
    <img
      className="pal-icon"
      src={`${import.meta.env.BASE_URL}icons/pals/${pals[pal].id}.png`}
      width={size}
      height={size}
      loading="lazy"
      alt=""
      onError={(e) => {
        (e.target as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}
