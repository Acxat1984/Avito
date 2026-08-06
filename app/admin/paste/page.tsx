import { PasteForm } from './paste-form';

export const dynamic = 'force-dynamic';

export default function PastePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Добавить из сообщения</h1>
        <p className="mt-1 text-sm text-gray-600">
          Скопируйте переписку из Avito (или любые заметки) и вставьте сюда — платформа сама разберёт
          данные по компаниям и заполнит карточки. Перед сохранением всё показывается на проверку.
        </p>
      </div>
      <PasteForm />
    </div>
  );
}
