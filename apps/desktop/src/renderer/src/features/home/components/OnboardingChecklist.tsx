import { Button, Icon } from '../../../ui';
import type { HomeOnboardingStep } from '../model/home.types';

export interface OnboardingChecklistProps {
  steps: HomeOnboardingStep[];
  onCreate: () => void;
  onOpen?: ((step: HomeOnboardingStep) => void) | undefined;
}

export function OnboardingChecklist({ onCreate, onOpen, steps }: OnboardingChecklistProps): React.JSX.Element | null {
  if (steps.every((step) => step.complete)) return null;
  return (
    <section className="home-widget home-onboarding" aria-labelledby="home-onboarding-title">
      <header className="home-widget__header"><div><span>Первые шаги</span><h2 id="home-onboarding-title">Что дальше?</h2></div><strong>{steps.filter((step) => step.complete).length}/{steps.length}</strong></header>
      <div className="home-onboarding__steps">{steps.map((step) => <article data-complete={step.complete || undefined} key={step.id}><span><Icon name={step.complete ? 'check' : 'sparkles'} size={16} /></span><div><strong>{step.title}</strong><small>{step.description}</small></div>{step.complete ? null : <Button onClick={step.id === 'create_server' ? onCreate : () => onOpen?.(step)} size="sm" variant="quiet">Начать</Button>}</article>)}</div>
    </section>
  );
}
