import {useEffect, useRef} from 'react';
import {Form, type FormProps} from 'react-router';

type SearchFormProps = Omit<FormProps, 'children'> & {
  children: (args: {
    inputRef: React.RefObject<HTMLInputElement>;
  }) => React.ReactNode;
};

export function SearchForm({children, className, ...props}: SearchFormProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useSearchKeyboardShortcut(inputRef);

  return (
    <Form
      {...props}
      className={['search-page__form', className].filter(Boolean).join(' ')}
      method="get"
    >
      {children({inputRef})}
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
