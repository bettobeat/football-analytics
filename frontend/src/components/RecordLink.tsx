import { Link, type LinkProps } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** A link to a record page (/accuracy, /basketball/accuracy): admins only for now (fix118), nothing for everyone else. */
export default function RecordLink(props: LinkProps) {
  const { access } = useAuth()
  return access === 'admin' ? <Link {...props} /> : null
}
