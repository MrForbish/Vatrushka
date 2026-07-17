export interface HomeWidgetSkeletonProps {
  label: string;
  rows?: number;
}

export function HomeWidgetSkeleton({ label, rows = 2 }: HomeWidgetSkeletonProps): React.JSX.Element {
  return (
    <section aria-busy="true" aria-label={label} className="home-widget home-widget-skeleton">
      <span className="home-skeleton home-skeleton--heading" />
      {Array.from({ length: rows }, (_, index) => <span className="home-skeleton home-skeleton--row" key={index} />)}
    </section>
  );
}
