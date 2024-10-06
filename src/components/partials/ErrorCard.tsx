import { Label } from '../elements/Label.js';
import { Card } from '../elements/Card.js';

export const ErrorCard: React.FC<{ error: unknown }> = ({ error }) => {
  return (
    <Card maxWidth="container.full">
      <Label text={typeof error === 'string' ? error : (error as Error).message} color="error" />
    </Card>
  );
};
