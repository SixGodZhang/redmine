import { useNavigate, useParams } from 'react-router-dom'
import { IssueDrawer } from '../../components/IssueDrawer'

export function IssueDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <IssueDrawer layout="page" issueId={id ? Number(id) : null} onClose={() => navigate(-1)} />
}
