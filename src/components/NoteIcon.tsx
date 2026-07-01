import { isImageIcon } from "../emojiPacks";

type NoteIconProps = {
  icon: string;
  className?: string;
};

export function NoteIcon({ icon, className = "note-icon" }: NoteIconProps) {
  if (isImageIcon(icon)) {
    return (
      <span className={`${className} image-icon`}>
        <img alt="" loading="lazy" src={icon} />
      </span>
    );
  }

  return <span className={className}>{icon}</span>;
}
