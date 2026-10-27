/** @OnlyCurrentDoc */
// Exportador Aprender v3 — perguntas e imagens em pacote ZIP.
// Execute no Apps Script vinculado ao seu Google Forms.
// Lê apenas a estrutura do formulário atual. Não lê respostas de alunos,
// Não altera o formulário. A função completa usa somente a API Google e suas imagens.
function exportarParaAprender() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Abra o editor de scripts pelo menu do seu Google Forms.');
  var payload = { info: { title: form.getTitle(), description: form.getDescription() || '' }, items: [], _aprenderWarnings: ['Comentários automáticos e desvios entre seções do Google não são exportados. Revise essas configurações.', 'O exportador simples inclui imagens separadas. Para imagens dentro de perguntas e alternativas, use exportarParaAprenderComImagens, conforme o guia do sistema.'] };
  var packageState = criarPacoteAprender_(payload);
  var quiz = form.isQuiz();
  form.getItems().forEach(function(item) {
    var type = String(item.getType());
    var result = { title: item.getTitle(), description: item.getHelpText() || '' };
    function readOptional(label, operation, fallback) {
      try { return operation(); }
      catch (error) {
        var warning = 'Pergunta "' + result.title + '": não foi possível ler ' + label + '. Confira esse dado na revisão da importação.';
        if (payload._aprenderWarnings.indexOf(warning) < 0) payload._aprenderWarnings.push(warning);
        return fallback;
      }
    }
    if (type === 'PAGE_BREAK') result.pageBreakItem = {};
    else if (type === 'SECTION_HEADER') result.textItem = {};
    else if (type === 'IMAGE') result.imageItem = { image: readOptional('imagem', function() { return adicionarImagemAprender_(item.asImageItem().getImage(), result.title || 'Imagem de contexto', packageState); }, null) };
    else if (type === 'VIDEO') result.videoItem = {};
    else {
      var typed = null;
      var question = {};
      if (type === 'MULTIPLE_CHOICE') typed = item.asMultipleChoiceItem();
      else if (type === 'LIST') typed = item.asListItem();
      else if (type === 'CHECKBOX') typed = item.asCheckboxItem();
      else if (type === 'TEXT') typed = item.asTextItem();
      else if (type === 'PARAGRAPH_TEXT') typed = item.asParagraphTextItem();
      else if (type === 'GRID' || type === 'CHECKBOX_GRID') {
        var grid = type === 'GRID' ? item.asGridItem() : item.asCheckboxGridItem();
        result.questionGroupItem = {
          questions: grid.getRows().map(function(row) { return { rowQuestion: { title: row }, required: grid.isRequired() }; }),
          grid: { columns: { type: type === 'GRID' ? 'RADIO' : 'CHECKBOX', options: grid.getColumns().map(function(value) { return { value: value }; }) } }
        };
      }
      if (typed) {
        question.required = readOptional('obrigatoriedade', function() { return typed.isRequired(); }, false);
        var points = quiz ? readOptional('pontuação', function() { return typed.getPoints(); }, null) : 0;
        question.grading = points === null ? {} : { pointValue: points };
        if (type === 'MULTIPLE_CHOICE' || type === 'LIST' || type === 'CHECKBOX') {
          var choices = typed.getChoices();
          var correct = [];
          var completeKey = true;
          question.choiceQuestion = { type: type === 'CHECKBOX' ? 'CHECKBOX' : type === 'LIST' ? 'DROP_DOWN' : 'RADIO', options: choices.map(function(choice) {
            if (quiz) {
              var isCorrect = readOptional('gabarito', function() { return choice.isCorrectAnswer(); }, null);
              if (isCorrect === null) completeKey = false;
              else if (isCorrect) correct.push({ value: choice.getValue() });
            }
            var option = { value: choice.getValue() };
            return option;
          }) };
          if (completeKey && correct.length) question.grading.correctAnswers = { answers: correct };
          if ((type === 'MULTIPLE_CHOICE' || type === 'CHECKBOX') && readOptional('opção Outro', function() { return typed.hasOtherOption(); }, false)) question.choiceQuestion.options.push({ isOther: true });
        } else question.textQuestion = { paragraph: type === 'PARAGRAPH_TEXT' };
      } else if (!result.questionGroupItem) question._aprenderType = type;
      if (!result.questionGroupItem) result.questionItem = { question: question };
    }
    payload.items.push(result);
  });
  mostrarPacoteAprender_(packageState);
}

// Configuração adicional da API Forms necessária; veja o guia na importação.
function exportarParaAprenderComImagens() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Abra o editor de scripts pelo seu Google Forms.');
  var response = UrlFetchApp.fetch('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(form.getId()), {
    method: 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('O Google não autorizou a API Forms (HTTP ' + response.getResponseCode() + '). Ative a API no projeto Cloud vinculado ao Apps Script e adicione os escopos do manifesto, conforme o guia Importar Google Forms do Aprender.');
  var payload = JSON.parse(response.getContentText());
  var state = criarPacoteAprender_(payload);
  var downloaded = {};
  function collect(image, label) {
    if (!image) return;
    try {
      var uri = image.contentUri;
      if (!uri || !/^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|gstatic\.com|google\.com)\//i.test(uri)) throw new Error('Endereço temporário da imagem indisponível.');
      var ref = downloaded[uri];
      if (!ref) {
        var imageResponse = UrlFetchApp.fetch(uri, { muteHttpExceptions: true, followRedirects: false });
        if (imageResponse.getResponseCode() !== 200) throw new Error('O Google não liberou a imagem.');
        ref = adicionarImagemAprender_(imageResponse.getBlob(), label, state);
        downloaded[uri] = ref;
      }
      image._aprenderAssetId = ref._aprenderAssetId;
      delete image.contentUri; delete image.sourceUri;
    } catch (error) { payload._aprenderWarnings.push(label + ': imagem não incluída. ' + error.message + ' Revise antes de publicar.'); }
  }
  function choices(question) {
    if (question && question.choiceQuestion) (question.choiceQuestion.options || []).forEach(function(option, i) { collect(option.image, 'Imagem da alternativa ' + (i + 1)); });
  }
  (payload.items || []).forEach(function(item) {
    if (item.imageItem) collect(item.imageItem.image, item.title || 'Imagem de contexto');
    if (item.questionItem) { collect(item.questionItem.image, 'Imagem da pergunta'); choices(item.questionItem.question); }
    if (item.questionGroupItem) {
      collect(item.questionGroupItem.image, 'Imagem da grade');
      (item.questionGroupItem.questions || []).forEach(choices);
      if (item.questionGroupItem.grid) (item.questionGroupItem.grid.columns.options || []).forEach(function(option, i) { collect(option.image, 'Imagem da coluna ' + (i + 1)); });
    }
  });
  mostrarPacoteAprender_(state);
}

function criarPacoteAprender_(payload) {
  payload._aprenderAssets = [];
  payload._aprenderWarnings = payload._aprenderWarnings || [];
  return { payload: payload, blobs: [], total: 0, hashes: {} };
}

function adicionarImagemAprender_(blob, caption, state) {
  var bytes = blob.getBytes();
  var png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every(function(value, i) { return (bytes[i] & 255) === value; });
  var jpeg = (bytes[0] & 255) === 255 && (bytes[1] & 255) === 216 && (bytes[2] & 255) === 255;
  if (!png && !jpeg) {
    blob = blob.getAs('image/png'); bytes = blob.getBytes();
    png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every(function(value, i) { return (bytes[i] & 255) === value; });
    if (!png) throw new Error('A imagem não pôde ser convertida para PNG.');
  }
  if (bytes.length > 5000000) throw new Error('A imagem ultrapassa 5 MB.');
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(value) { return ('0' + ((value + 256) % 256).toString(16)).slice(-2); }).join('');
  if (state.hashes[hash]) return { _aprenderAssetId: state.hashes[hash], altText: caption };
  if (state.blobs.length >= 200 || state.total + bytes.length > 20000000) throw new Error('O conjunto ultrapassa 200 imagens ou 20 MB. Divida o formulário.');
  var id = Utilities.getUuid();
  var path = 'imagens/' + id + (png ? '.png' : '.jpg');
  state.blobs.push(blob.copyBlob().setName(path));
  state.payload._aprenderAssets.push({ id: id, path: path }); state.total += bytes.length; state.hashes[hash] = id;
  return { _aprenderAssetId: id, altText: caption };
}

function mostrarPacoteAprender_(state) {
  var payload = state.payload;
  var blob = Utilities.newBlob(JSON.stringify(payload, null, 2), 'application/json', state.blobs.length ? 'formulario.json' : 'google-forms-aprender.json');
  var filename = 'google-forms-aprender.json'; var mimeType = 'application/json';
  if (state.blobs.length) { filename = 'google-forms-aprender.zip'; mimeType = 'application/zip'; blob = Utilities.zip([blob].concat(state.blobs), filename); }
  var encoded = Utilities.base64Encode(blob.getBytes());
  var html = HtmlService.createHtmlOutput('<div style="font:16px Arial;padding:20px;line-height:1.6"><p>Seu arquivo está pronto: ' + state.blobs.length + ' imagem(ns).</p><a style="display:inline-block;background:#226353;color:white;padding:12px 18px;border-radius:8px;text-decoration:none" download="' + filename + '" href="data:' + mimeType + ';base64,' + encoded + '">Baixar arquivo para importar</a><p>Envie o arquivo completo no Aprender. Se for ZIP, não extraia os arquivos. Confira os avisos na prévia.</p></div>').setWidth(480).setHeight(300);
  FormApp.getUi().showModalDialog(html, 'Exportar formulário para Aprender');
}
