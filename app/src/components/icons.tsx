// Alle Icons der App: flach, einfarbig (erben die Textfarbe), Linienstärke 2 auf 24-px-Raster.
// Regeln: public/brand/BRAND.md → „Icons“. Keine Emojis, keine mehrfarbigen Icons.
import {
  Camera,
  Check,
  CircleCheck,
  CircleHelp,
  Database,
  ExternalLink,
  ImageUp,
  Pencil,
  Search,
  ShieldCheck,
  TriangleAlert,
  User,
  Wheat,
  X,
  type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'

type IconComponent = ComponentType<LucideProps>

function icon(Base: IconComponent): IconComponent {
  return function Icon({ className, ...props }) {
    return <Base strokeWidth={2} aria-hidden="true" className={`icon${className ? ` ${className}` : ''}`} {...props} />
  }
}

export const CameraIcon = icon(Camera)
export const CheckIcon = icon(Check)
export const CircleCheckIcon = icon(CircleCheck)
export const CircleHelpIcon = icon(CircleHelp)
export const DatabaseIcon = icon(Database)
export const ExternalLinkIcon = icon(ExternalLink)
export const ImageUpIcon = icon(ImageUp)
export const PencilIcon = icon(Pencil)
export const SearchIcon = icon(Search)
export const ShieldCheckIcon = icon(ShieldCheck)
export const TriangleAlertIcon = icon(TriangleAlert)
export const UserIcon = icon(User)
// Normales Weizen-Symbol für „Enthält Gluten“. Das durchgestrichene Weizen-Symbol („Crossed Grain“) ist
// eine geschützte Marke und wird nirgends verwendet (siehe BRAND.md).
export const WheatIcon = icon(Wheat)
export const XIcon = icon(X)
