import os
from dotenv import load_dotenv
import atexit
import tempfile
import logging
from io import BytesIO
from typing import Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS

from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_chroma import Chroma
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_community.document_loaders import WebBaseLoader
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_openai import ChatOpenAI, OpenAIEmbeddings, AzureChatOpenAI, AzureOpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_community.document_loaders.parsers.pdf import (
    PyMuPDFParser
)
from langchain_core.document_loaders import Blob
from langchain_core.documents import Document

class BytesIOPyMuPDFLoader(PyMuPDFLoader):
    """Load `PDF` files using `PyMuPDF` from a BytesIO stream."""

    def __init__(
        self,
        pdf_stream: BytesIO,
        *,
        extract_images: bool = False,
        **kwargs: Any,
    ) -> None:
        """Initialize with a BytesIO stream."""
        try:
            import fitz  # noqa:F401
        except ImportError:
            raise ImportError(
                "`PyMuPDF` package not found, please install it with "
                "`pip install pymupdf`"
            )
        # We don't call the super().__init__ here because we don't have a file_path.
        self.pdf_stream = pdf_stream
        self.extract_images = extract_images
        self.text_kwargs = kwargs

    def load(self, **kwargs: Any) -> List[Document]:
        """Load file."""
        if kwargs:
            logging.warning(
                f"Received runtime arguments {kwargs}. Passing runtime args to `load`"
                f" is deprecated. Please pass arguments during initialization instead."
            )

        text_kwargs = {**self.text_kwargs, **kwargs}

        # Use 'stream' as a placeholder for file_path since we're working with a stream.
        blob = Blob.from_data(self.pdf_stream.getvalue(), path="stream")

        parser = PyMuPDFParser(
            text_kwargs=text_kwargs, extract_images=self.extract_images
        )

        return parser.parse(blob)

app = Flask(__name__)
CORS(app)

load_dotenv()
# OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
# llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0, api_key=OPENAI_API_KEY)
AZURE_OPENAI_API_KEY = os.getenv('AZURE_OPENAI_API_KEY')
AZURE_OPENAI_ENDPOINT = os.getenv('AZURE_OPENAI_ENDPOINT')
AZURE_OPENAI_DEPLOYMENT = os.getenv('AZURE_OPENAI_DEPLOYMENT')
AZURE_OPENAI_API_VERSION = os.getenv('AZURE_OPENAI_API_VERSION')
AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT = os.getenv('AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT')
llm = AzureChatOpenAI(
    api_key=AZURE_OPENAI_API_KEY,
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    azure_deployment=AZURE_OPENAI_DEPLOYMENT, 
    api_version=AZURE_OPENAI_API_VERSION, 
    temperature=0, 
    max_tokens=None, 
    timeout=None, 
    max_retries=2
)

# Global variables
vectorstore = None
conversational_rag_chain = None
store = {}

def get_session_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in store:
        store[session_id] = ChatMessageHistory()
    return store[session_id]

@app.route('/upload_file', methods=['POST'])
def upload_file():
    global vectorstore, conversational_rag_chain
    
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file:
        file_content = file.read()
        
        loader = BytesIOPyMuPDFLoader(BytesIO(file_content))
        docs = loader.load()
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = text_splitter.split_documents(docs)
        
        embeddings = AzureOpenAIEmbeddings(
            api_key=AZURE_OPENAI_API_KEY,
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
            azure_deployment=AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT, 
            api_version=AZURE_OPENAI_API_VERSION
        )
        vectorstore = Chroma.from_documents(documents=splits, embedding=embeddings)
        retriever = vectorstore.as_retriever()
        
        contextualize_q_system_prompt = """Given a chat history and the latest user question \
        which might reference context in the chat history, formulate a standalone question \
        which can be understood without the chat history. Do NOT answer the question, \
        just reformulate it if needed and otherwise return it as is."""
        contextualize_q_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", contextualize_q_system_prompt),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        history_aware_retriever = create_history_aware_retriever(
            llm, retriever, contextualize_q_prompt
        )
        
        qa_system_prompt = """You are an assistant for question-answering tasks. \
        Use the following pieces of retrieved context to answer the question. \
        If you don't know the answer, just say that you don't know. \
        Use three sentences maximum and keep the answer concise.\

        {context}"""
        qa_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", qa_system_prompt),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
        
        rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)
        
        conversational_rag_chain = RunnableWithMessageHistory(
            rag_chain,
            get_session_history,
            input_messages_key="input",
            history_messages_key="chat_history",
            output_messages_key="answer",
        )
        
        return jsonify({"message": "File uploaded and processed successfully"}), 200

@app.route('/ask_question', methods=['POST'])
def ask_question():
    global conversational_rag_chain
    
    if not conversational_rag_chain:
        return jsonify({"error": "No file has been uploaded yet"}), 400
    
    data = request.json
    if 'question' not in data or 'session_id' not in data:
        return jsonify({"error": "Missing question or session_id"}), 400
    
    question = data['question']
    session_id = data['session_id']
    
    response = conversational_rag_chain.invoke(
        {"input": question},
        config={"configurable": {"session_id": session_id}},
    )["answer"]
    
    return jsonify({"answer": response}), 200

def cleanup_chroma():
    global vectorstore
    if vectorstore:
        vectorstore.delete_collection()
        print("Deleted Chroma collection.")

@app.route('/cleanup', methods=['POST'])
def cleanup():
    global vectorstore, conversational_rag_chain, store
    cleanup_chroma()
    vectorstore = None
    conversational_rag_chain = None
    store = {}
    return jsonify({"message": "Cleanup completed successfully."}), 200

atexit.register(cleanup_chroma)

if __name__ == '__main__':
    app.run(debug=True)