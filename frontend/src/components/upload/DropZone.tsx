import { useDropzone } from 'react-dropzone'
import { Upload, FileImage, FileText } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

const ACCEPTED = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/tiff': ['.tif', '.tiff'],
  'application/pdf': ['.pdf'],
}

export default function DropZone({ onFile, disabled }: Props) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: ACCEPTED,
    maxSize: 20 * 1024 * 1024,
    multiple: false,
    disabled,
    onDropAccepted: ([file]) => onFile(file),
  })

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
        isDragActive && !isDragReject && 'border-blue-400 bg-blue-50',
        isDragReject && 'border-red-400 bg-red-50',
        !isDragActive && 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        <div className="p-4 bg-blue-100 rounded-full">
          <Upload size={28} className="text-blue-600" />
        </div>
        <div>
          <p className="font-medium text-gray-700">
            {isDragActive ? 'Drop your invoice here' : 'Drag & drop invoice file'}
          </p>
          <p className="text-sm text-gray-400 mt-1">or click to browse</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><FileImage size={12} /> PNG, JPG, TIFF</span>
          <span className="flex items-center gap-1"><FileText size={12} /> PDF</span>
          <span>Max 20MB</span>
        </div>
      </div>
    </div>
  )
}
