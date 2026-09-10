import {useEffect, useRef} from 'react';
import {Form, type FormProps} from 'react-router';
import {useSearchRouteInput} from '~/lib/useSearchRouteInput';

type SearchFormProps = Omit<FormProps, 'children'> & {
  children: (args: {
    defaultValue: string;
    inputRef: React.RefObject<HTMLInputElement>;
  }) => React.ReactNode;
};

export function SearchForm({children, className, ...props}: SearchFormProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const defaultValue = useSearchRouteInput(inputRef);

  useSearchKeyboardShortcut(inputRef);

  return (
    <Form
      {...props}
      className={['search-page__form', className].filter(Boolean).join(' ')}
      method="get"
    >
      {children({defaultValue, inputRef})}
    </Form>
  );
}

function useSearchKeyboardShortcut(
  inputRef: React.RefObject<HTMLInputElement>,
) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
      }

      if (
        event.key === 'Escape' &&
        document.activeElement === inputRef.current
      ) {
        inputRef.current?.blur();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [inputRef]);
}
