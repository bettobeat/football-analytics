import Accuracy from '../components/sport/Accuracy'
import { footballAccuracy } from '../components/sport/accuracy/football'

/** The public record (fix152b: the shared Accuracy page, components/sport/Accuracy, with football's adapter). */
export default function AccuracySimple() {
  return <Accuracy a={footballAccuracy} />
}
