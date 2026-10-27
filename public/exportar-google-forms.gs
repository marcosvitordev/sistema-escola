/** @OnlyCurrentDoc */
// Execute no Apps Script vinculado ao seu Google Forms.
// Lê apenas a estrutura do formulário atual. Não lê respostas de alunos,
// não altera o formulário e não envia dados pela rede.
function exportarParaAprender() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Abra o editor de scripts pelo menu do seu Google Forms.');
  var payload = { info: { title: form.getTitle(), description: form.getDescription() || '' }, items: [] };
  form.getItems().forEach(function(item) {
    var type = String(item.getType());
    var result = { title: item.getTitle(), description: item.getHelpText() || '' };
    if (type === 'PAGE_BREAK') result.pageBreakItem = {};
    else if (type === 'SECTION_HEADER') result.textItem = {};
    else if (type === 'IMAGE') result.imageItem = {};
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
        question.required = typed.isRequired();
        question.grading = { pointValue: form.isQuiz() ? typed.getPoints() : 0 };
        if (typeof typed.getFeedbackForCorrect === 'function' && typed.getFeedbackForCorrect()) question.grading.whenRight = { text: typed.getFeedbackForCorrect().getText() };
        if (typeof typed.getFeedbackForIncorrect === 'function' && typed.getFeedbackForIncorrect()) question.grading.whenWrong = { text: typed.getFeedbackForIncorrect().getText() };
        if (typeof typed.getGeneralFeedback === 'function' && typed.getGeneralFeedback()) question.grading.generalFeedback = { text: typed.getGeneralFeedback().getText() };
        if (type === 'MULTIPLE_CHOICE' || type === 'LIST' || type === 'CHECKBOX') {
          var choices = typed.getChoices();
          var correct = [];
          question.choiceQuestion = { type: type === 'CHECKBOX' ? 'CHECKBOX' : type === 'LIST' ? 'DROP_DOWN' : 'RADIO', options: choices.map(function(choice) {
            if (form.isQuiz() && choice.isCorrectAnswer()) correct.push({ value: choice.getValue() });
            var option = { value: choice.getValue() };
            if (type === 'MULTIPLE_CHOICE') {
              var navigation = choice.getPageNavigationType();
              if (navigation) option.goToAction = String(navigation);
            }
            return option;
          }) };
          if (correct.length) question.grading.correctAnswers = { answers: correct };
          if ((type === 'MULTIPLE_CHOICE' || type === 'CHECKBOX') && typed.hasOtherOption()) question.choiceQuestion.options.push({ isOther: true });
        } else question.textQuestion = { paragraph: type === 'PARAGRAPH_TEXT' };
      } else if (!result.questionGroupItem) question._aprenderType = type;
      if (!result.questionGroupItem) result.questionItem = { question: question };
    }
    payload.items.push(result);
  });
  var blob = Utilities.newBlob(JSON.stringify(payload, null, 2), 'application/json', 'google-forms-aprender.json');
  var encoded = Utilities.base64Encode(blob.getBytes());
  var html = HtmlService.createHtmlOutput('<div style="font:16px Arial;padding:20px;line-height:1.6"><p>Seu arquivo está pronto.</p><a style="display:inline-block;background:#226353;color:white;padding:12px 18px;border-radius:8px;text-decoration:none" download="google-forms-aprender.json" href="data:application/json;base64,' + encoded + '">Baixar arquivo para importar</a><p>Depois, envie este arquivo na opção Importar Google Forms do Aprender.</p></div>').setWidth(480).setHeight(270);
  FormApp.getUi().showModalDialog(html, 'Exportar formulário para Aprender');
}
