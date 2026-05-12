import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


def check_dependencies():
    missing = []
    if Image is None:
        missing.append('Pillow')
    if pytesseract is None:
        missing.append('pytesseract')
    if OpenAI is None:
        missing.append('openai')
    if missing:
        raise RuntimeError(
            '必要なパッケージが不足しています: ' + ', '.join(missing) +
            '\nインストール: pip install pillow pytesseract openai'
        )


def extract_text_from_image(image_path: Path) -> str:
    if Image is None or pytesseract is None:
        raise RuntimeError('OCR の依存関係が見つかりません。')

    if not image_path.exists():
        raise FileNotFoundError(f'画像ファイルが見つかりません: {image_path}')

    with Image.open(image_path) as img:
        text = pytesseract.image_to_string(img, lang='jpn+eng')
    return text.strip()


def build_prompt(note_text: str) -> str:
    return (
        'あなたは中高生向けの学習支援AIです。以下のノートの内容から、\n'
        '1) 重要ポイントのまとめ\n'
        '2) 具体的な練習問題 3～5問\n'
        '3) それぞれの解答\n'
        'を日本語で出力してください。\n'
        'なるべくシンプルで読みやすい形式にしてください。\n\n'
        '【ノート内容】\n'
        f'{note_text}\n'
    )


def generate_questions(note_text: str, api_key: str | None = None) -> str:
    if OpenAI is None:
        raise RuntimeError('OpenAI ライブラリが読み込まれていません。')

    api_key = api_key or os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise RuntimeError('環境変数 OPENAI_API_KEY が設定されていません。')

    client = OpenAI(api_key=api_key)
    prompt = build_prompt(note_text)

    response = client.responses.create(
        model='gpt-4.1-mini',
        input=[
            {'role': 'system', 'content': 'あなたは日本語で回答する知的な学習アシスタントです。'},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.7,
        max_output_tokens=800,
    )

    if hasattr(response, 'output_text') and response.output_text:
        return response.output_text.strip()

    if hasattr(response, 'output'):
        pieces = []
        for item in response.output:
            if item.get('type') == 'output_text':
                pieces.append(item.get('content', [])[0].get('text', ''))
        if pieces:
            return '\n'.join(pieces).strip()

    raise RuntimeError('AI レスポンスの解析に失敗しました。')


def main():
    parser = argparse.ArgumentParser(
        description='ノートの写真から AI を使って問題を作成するツール'
    )
    parser.add_argument('image', help='ノート写真のファイルパス (.jpg, .png など)')
    parser.add_argument('--api-key', help='OpenAI API キー（省略時は OPENAI_API_KEY 環境変数を使用）')
    parser.add_argument('--output', help='生成結果を保存するファイル名（例: output.txt）', default=None)
    args = parser.parse_args()

    try:
        check_dependencies()
        note_text = extract_text_from_image(Path(args.image))

        if not note_text:
            raise RuntimeError('画像からテキストを抽出できませんでした。もう一度撮影してください。')

        print('=== 抽出されたノートテキスト ===\n')
        print(note_text)
        print('\n=== AI による問題生成中... ===\n')

        result = generate_questions(note_text, api_key=args.api_key)
        print(result)

        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(result)
            print(f'\n結果を保存しました: {args.output}')

    except Exception as exc:
        print(f'エラー: {exc}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
