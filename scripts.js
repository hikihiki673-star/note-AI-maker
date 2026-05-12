const uploadButton = document.getElementById('upload-button');
const uploadInput = document.getElementById('upload-input');
const previewImage = document.getElementById('preview-image');
const parseButton = document.getElementById('parse-button');
const statusText = document.getElementById('status-text');
const uploadInstruction = document.getElementById('upload-instruction');
const resultOutput = document.getElementById('result-output');
let currentImageFile = null;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.slide-up').forEach((el) => {
    el.classList.add('visible');
  });
});

const buildPrompt = (noteText) => {
  return `あなたは中高生向けの学習支援AIです。以下のノートの内容を読み、\n`
    + `1) ノートが中学生向けか高校生向けかを判断し、その理由を簡潔に記載する。\n`
    + `2) 過去の定期テストや入試の問題に似た傾向の練習問題を、4〜5問作る。\n`
    + `3) それぞれの問題に対して解答をつける。\n`
    + `4) 問題は日本語で、分かりやすく解答付きで出力する。\n`
    + `5) できるだけ実際の試験問題の形式に近い形で作成する。\n\n`
    + `【ノート内容】\n${noteText}`;
};

const setStatus = (message) => {
  statusText.textContent = message;
};

const showResult = (text) => {
  resultOutput.hidden = false;
  resultOutput.textContent = text;
};

const loadImagePreview = (file) => {
  const url = URL.createObjectURL(file);
  previewImage.src = url;
  previewImage.hidden = false;
};

uploadButton.addEventListener('click', () => {
  uploadInput.click();
});

uploadInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  currentImageFile = file;
  loadImagePreview(file);
  setStatus('画像が選択されました。AI 解析の準備ができました。');
  uploadInstruction.textContent = '「AI で解析」ボタンを押すと、OCR と AI の解析が始まります。';
});

parseButton.addEventListener('click', async () => {
  if (!currentImageFile) {
    setStatus('まずはノートの写真を選択してください。');
    return;
  }

  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) {
    setStatus('まず OpenAI API キーを入力してください。');
    return;
  }

  setStatus('OCR を実行中...');
  resultOutput.hidden = true;
  resultOutput.textContent = '';

  try {
    const { data } = await Tesseract.recognize(currentImageFile, 'jpn', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setStatus(`OCR: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const noteText = data.text.trim();
    if (!noteText) {
      throw new Error('画像からテキストを抽出できませんでした。別の写真を試してください。');
    }

    setStatus('AI 解析用テキストを構成中...');
    const prompt = buildPrompt(noteText);

    setStatus('AI を呼び出しています...');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: 'あなたは日本語で回答する賢い学習アシスタントです。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_output_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI 解析に失敗しました: ${response.status}\n${errorText}`);
    }

    const resultJson = await response.json();
    let textOutput = '';

    if (resultJson.output_text) {
      textOutput = resultJson.output_text;
    } else if (resultJson.output) {
      textOutput = resultJson.output
        .map((item) => {
          if (item.type === 'output_text') {
            return item.content?.map((contentItem) => contentItem.text || '').join('');
          }
          return '';
        })
        .join('')
        .trim();
    }

    if (!textOutput) {
      throw new Error('AI からの応答が正しく取得できませんでした。');
    }

    showResult(textOutput);
    setStatus('解析が完了しました。結果をスクロールして確認してください。');
  } catch (error) {
    console.error(error);
    setStatus(error.message || '解析中にエラーが発生しました。');
  }
});
